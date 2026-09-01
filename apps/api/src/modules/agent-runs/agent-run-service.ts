import { randomUUID } from 'node:crypto';
import type {
  AgentRunContract,
  AgentToolCompletionReceipt,
  AgentToolIntent,
  AgentToolRequest
} from '@enterprise-brain/contracts';
import type {
  AgentRunRepository,
  TaskRepository
} from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';

export class AgentRunNotFoundError extends Error {}
export class AgentRunConflictError extends Error {}
export class AgentRunInvalidResultError extends Error {}
export class HumanConfirmationRequiredError extends Error {}
export class AgentToolNotAllowedError extends Error {}
export class AgentRunForbiddenError extends Error {}
export class AgentRunService {
  constructor(
    private readonly runs: AgentRunRepository,
    private readonly tasks: TaskRepository
  ) {}
  async create(
    context: RequestContext,
    taskId: string,
    input: { agentId: string; intent: AgentToolIntent }
  ): Promise<{ run: AgentRunContract; toolRequest: AgentToolRequest; humanConfirmation?: import('@enterprise-brain/contracts').HumanConfirmationContract }> {
    const result=await this.runs.createCatalogRun({id:randomUUID(),toolCallId:randomUUID(),userId:context.currentUser.id,taskId,agentId:input.agentId,intent:input.intent});
    if(result==='NOT_FOUND')throw new AgentRunNotFoundError();if(result==='FORBIDDEN')throw new AgentRunForbiddenError();if(result==='TOOL_NOT_ALLOWED')throw new AgentToolNotAllowedError();return result;
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
    if (result === 'INVALID') throw new AgentRunInvalidResultError();
    if (result === 'HUMAN_CONFIRMATION_REQUIRED') throw new HumanConfirmationRequiredError();
    return result;
  }
  async get(context: RequestContext, runId: string): Promise<AgentRunContract> {
    const run = await this.runs.findForUser(runId, context.currentUser.id);
    if (!run) throw new AgentRunNotFoundError();
    return run;
  }
}
