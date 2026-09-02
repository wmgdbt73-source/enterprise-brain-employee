import { randomUUID } from 'node:crypto';
import { modelRequestFingerprint, normalizeModelPrompt } from '@enterprise-brain/domain';
import type { ModelInvocationContract } from '@enterprise-brain/contracts';
import type { ModelInvocationRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';
import { ModelProviderError, type ModelProvider } from '../../providers/model-provider.js';
import { OpenAIResponsesProvider } from '../../providers/openai-responses-provider.js';
import { isReadOnlyToolName, readOnlyToolDefinitions, validEmptyArguments } from './read-only-tool-registry.js';

export class ModelInvocationNotFoundError extends Error {}
export class ModelInvocationForbiddenError extends Error {}
export class ModelIdempotencyConflictError extends Error {}
export class ModelPromptValidationError extends Error {}
export class ModelProviderNotConfiguredError extends Error {}
export class ModelFinalizeError extends Error {}
export class ModelProviderFailureError extends Error { constructor(readonly statusCode: 429 | 502 | 504) { super('Model provider failed'); } }

export class ModelRuntimeService {
  constructor(private readonly invocations: ModelInvocationRepository, private readonly injectedProvider?: ModelProvider) {}

  async create(context: RequestContext, taskId: string, input: { agentId: string; prompt: string }, idempotencyKey: string): Promise<{ invocation: ModelInvocationContract; created: boolean; running: boolean }> {
    const prompt = normalizeModelPrompt(input.prompt);
    if (!prompt || prompt.length > 8000) throw new ModelPromptValidationError('Prompt must contain 1 to 8000 characters');
    if (!idempotencyKey.trim()) throw new ModelPromptValidationError('Idempotency-Key is required');
    let provider: ModelProvider;
    try { provider = this.getProvider(); } catch (error) { if (error instanceof ModelProviderError && error.code === 'MODEL_PROVIDER_NOT_CONFIGURED') throw new ModelProviderNotConfiguredError(); throw error; }
    const begun = await this.invocations.beginForTask({ agentRunId: randomUUID(), invocationId: randomUUID(), userId: context.currentUser.id, taskId, agentId: input.agentId, prompt, idempotencyKey, requestFingerprint: modelRequestFingerprint({ userId: context.currentUser.id, taskId, agentId: input.agentId, prompt }), provider: provider.providerName, model: provider.model, now: new Date() });
    if (typeof begun === 'string') this.throwBeginError(begun);
    if (begun.disposition === 'EXISTING_RUNNING') return { invocation: begun.invocation, created: false, running: true };
    if (begun.disposition === 'EXISTING_COMPLETED' || begun.disposition === 'EXISTING_FAILED') return { invocation: begun.invocation, created: false, running: false };
    const instructions = [
      'You are an enterprise Task assistant.',
      'Return text suggestions only.',
      'Do not claim that you modified a Task, file, permission, or executed a tool.',
      `Organization: ${begun.context.organizationName}`,
      `Project: ${begun.context.projectName}`,
      `Task title: ${begun.context.taskTitle}`,
      `Task status: ${begun.context.taskStatus}`,
      ...(begun.context.taskDescription ? [`Task description: ${begun.context.taskDescription}`] : []),
      `Agent: ${begun.context.agentName} v${begun.context.agentVersion}`,
      ...(begun.context.agentDescription ? [`Agent description: ${begun.context.agentDescription}`] : [])
    ].join('\n');
    try {
      let replayItems: import('../../providers/model-provider.js').ProviderReplayItem[] = [];
      let toolCalls = 0;
      for (let step = 0; step < 5; step += 1) {
      const generated = await provider.generate({ instructions, input: prompt, tools: readOnlyToolDefinitions, replayItems });
      if (generated.kind === 'tool_calls') {
        if (!generated.calls.length || generated.calls.length + toolCalls > 4 || new Set(generated.calls.map(call => call.callId)).size !== generated.calls.length) return this.failToolRun(begun.invocation.id, 'MODEL_TOOL_LIMIT_EXCEEDED');
        const outputs: import('../../providers/model-provider.js').ProviderReplayItem[] = [];
        for (const call of generated.calls) {
          if (!call.callId || !isReadOnlyToolName(call.name) || !validEmptyArguments(call.argumentsJson)) return this.failToolRun(begun.invocation.id, 'MODEL_TOOL_INVALID');
          const result = await this.invocations.executeReadTool({ invocationId: begun.invocation.id, userId: context.currentUser.id, name: call.name, callId: call.callId, argumentsJson: call.argumentsJson, sequence: ++toolCalls });
          if ('AUTHORIZATION_REVOKED' === result || 'INVALID' === result) return this.failToolRun(begun.invocation.id, result === 'AUTHORIZATION_REVOKED' ? 'MODEL_TOOL_AUTHORIZATION_REVOKED' : 'MODEL_TOOL_INVALID');
          outputs.push({ type: 'function_call_output', call_id: call.callId, output: JSON.stringify(result.output) });
        }
        replayItems = [...replayItems, ...(generated.replayItems ?? []), ...outputs];
        continue;
      }
      let finalized;
      try {
        finalized = await this.invocations.complete({ invocationId: begun.invocation.id, providerResponseId: generated.providerResponseId, outputText: generated.outputText, model: provider.model, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, totalTokens: generated.totalTokens, completedAt: new Date() });
      } catch {
        // The provider already ran. Do not retry it or leak an infrastructure
        // error if the terminal persistence transaction cannot commit.
        throw new ModelFinalizeError();
      }
      if (typeof finalized === 'string') throw new ModelFinalizeError();
      return { invocation: finalized, created: true, running: false };
      }
      return this.failToolRun(begun.invocation.id, 'MODEL_TOOL_LIMIT_EXCEEDED');
    } catch (error) {
      if (!(error instanceof ModelProviderError)) throw error;
      let failed;
      try {
        failed = await this.invocations.fail({ invocationId: begun.invocation.id, errorCode: error.code, completedAt: new Date() });
      } catch {
        throw new ModelFinalizeError();
      }
      if (typeof failed === 'string') throw new ModelFinalizeError();
      throw new ModelProviderFailureError(error.code === 'MODEL_PROVIDER_RATE_LIMITED' ? 429 : error.code === 'MODEL_PROVIDER_TIMEOUT' ? 504 : 502);
    }
  }

  private async failToolRun(invocationId:string,errorCode:string):Promise<never>{const failed=await this.invocations.fail({invocationId,errorCode,completedAt:new Date()});if(typeof failed==='string')throw new ModelFinalizeError();throw new ModelProviderFailureError(502);}

  async list(context: RequestContext, taskId: string, limit?: number): Promise<ModelInvocationContract[]> {
    const rows = await this.invocations.listForTaskForMember({ userId: context.currentUser.id, taskId, limit });
    if (rows === 'NOT_FOUND') throw new ModelInvocationNotFoundError();
    return rows;
  }

  private getProvider(): ModelProvider { return this.injectedProvider ?? new OpenAIResponsesProvider(); }
  private throwBeginError(error: string): never {
    if (error === 'NOT_FOUND') throw new ModelInvocationNotFoundError();
    if (error === 'IDEMPOTENCY_CONFLICT') throw new ModelIdempotencyConflictError();
    throw new ModelInvocationForbiddenError();
  }
}
