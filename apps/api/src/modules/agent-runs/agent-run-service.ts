/* eslint-disable @typescript-eslint/no-explicit-any -- legacy EB-008 request compatibility is schema-validated. */
import { randomUUID } from 'node:crypto';
import { asAgentRunId, asAgentToolCallId, createAgentRun, startAgentRun, waitForHumanAgentRun } from '@enterprise-brain/domain';
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
    input: { agentId?: string; intent: AgentToolIntent } | AgentToolIntent
  ): Promise<{ run: AgentRunContract; toolRequest: AgentToolRequest; humanConfirmation?: import('@enterprise-brain/contracts').HumanConfirmationContract }> {
    if (!('intent' in input)) {
      const task=await this.tasks.loadDomainTaskForMember(taskId,context.currentUser.id);if(!task)throw new AgentRunNotFoundError();const now=new Date();const draft=createAgentRun({id:asAgentRunId(randomUUID()),userId:context.currentUser.id,projectId:task.projectId,taskId:task.id,agentDefinitionKey:input.name==='write_file'?'confirmed-write-work-agent-v1':'read-only-work-agent-v1',agentVersion:1,intent:input},now);const run=input.name==='write_file'?waitForHumanAgentRun(draft,now):startAgentRun(draft,now);const contract=legacyContract(run);const toolRequest:any={id:asAgentToolCallId(randomUUID()),runId:run.id,userId:run.userId,projectId:run.projectId,...input};if(input.name==='write_file'){const confirmation:any={id:randomUUID(),agentRunId:run.id,toolCallId:toolRequest.id,userId:run.userId,projectId:run.projectId,taskId:run.taskId,status:'PENDING',createdAt:now.toISOString()};await this.runs.createWaitingForHuman(contract,toolRequest,confirmation);return{run:contract,toolRequest,humanConfirmation:confirmation};}await this.runs.createRunning(contract,toolRequest);return{run:contract,toolRequest};
    }
    const result=await this.runs.createCatalogRun({id:randomUUID(),toolCallId:randomUUID(),userId:context.currentUser.id,taskId,agentId:input.agentId!,intent:input.intent});
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
function legacyContract(run: any): AgentRunContract { return { id:run.id,userId:run.userId,projectId:run.projectId,taskId:run.taskId,agentDefinitionKey:run.agentDefinitionKey,agentVersion:run.agentVersion ?? 1,kind:run.kind ?? 'TOOL',status:run.status,createdAt:run.createdAt.toISOString(),...(run.startedAt?{startedAt:run.startedAt.toISOString()}:{}),updatedAt:run.updatedAt.toISOString() }; }
