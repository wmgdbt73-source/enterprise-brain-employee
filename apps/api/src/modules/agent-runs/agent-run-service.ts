import { randomUUID } from 'node:crypto';
import type {
  AgentRunContract,
  AgentToolCompletionReceipt,
  AgentToolIntent,
  AgentToolRequest
} from '@enterprise-brain/contracts';
import {
  asAgentRunId,
  asAgentToolCallId,
  createAgentRun,
  startAgentRun
} from '@enterprise-brain/domain';
import type {
  AgentRunRepository,
  TaskRepository
} from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';

export class AgentRunNotFoundError extends Error {}
export class AgentRunConflictError extends Error {}
export class AgentRunService {
  constructor(
    private readonly runs: AgentRunRepository,
    private readonly tasks: TaskRepository
  ) {}
  async create(
    context: RequestContext,
    taskId: string,
    intent: AgentToolIntent
  ): Promise<{ run: AgentRunContract; toolRequest: AgentToolRequest }> {
    const task = await this.tasks.loadDomainTaskForMember(
      taskId,
      context.currentUser.id
    );
    if (!task) throw new AgentRunNotFoundError();
    const now = new Date();
    const run = startAgentRun(
      createAgentRun(
        {
          id: asAgentRunId(randomUUID()),
          userId: context.currentUser.id,
          projectId: task.projectId,
          taskId: task.id,
          agentDefinitionKey: 'read-only-work-agent-v1',
          intent
        },
        now
      ),
      now
    );
    const toolRequest: AgentToolRequest = {
      id: asAgentToolCallId(randomUUID()),
      runId: run.id,
      userId: run.userId,
      projectId: run.projectId,
      ...intent
    };
    const contract = toContract(run);
    await this.runs.createRunning(contract, toolRequest);
    return { run: contract, toolRequest };
  }
  async complete(
    context: RequestContext,
    runId: string,
    receipt: AgentToolCompletionReceipt
  ): Promise<AgentRunContract> {
    const result = await this.runs.complete(
      runId,
      context.currentUser.id,
      receipt
    );
    if (!result) throw new AgentRunNotFoundError();
    if (result === 'CONFLICT') throw new AgentRunConflictError();
    return result;
  }
  async get(context: RequestContext, runId: string): Promise<AgentRunContract> {
    const run = await this.runs.findForUser(runId, context.currentUser.id);
    if (!run) throw new AgentRunNotFoundError();
    return run;
  }
}
function toContract(run: ReturnType<typeof startAgentRun>): AgentRunContract {
  return {
    id: run.id,
    userId: run.userId,
    projectId: run.projectId,
    taskId: run.taskId,
    agentDefinitionKey: run.agentDefinitionKey,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString(),
    updatedAt: run.updatedAt.toISOString()
  };
}
