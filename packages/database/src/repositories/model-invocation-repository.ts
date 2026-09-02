import { modelInputHash } from '@enterprise-brain/domain';
import type { BeginModelRunDisposition, ModelInvocationContract, ModelRunContext } from '@enterprise-brain/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { evaluatePermission, type PermissionDbClient } from './permission-repository.js';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;
export type ModelInvocationError = 'NOT_FOUND' | 'FORBIDDEN' | 'IDEMPOTENCY_CONFLICT' | 'INVALID_STATE_TRANSITION' | 'AGENT_NOT_ASSIGNED' | 'AGENT_EXECUTE_DENIED' | 'AGENT_DISABLED';
export type BeginModelRun = { disposition: BeginModelRunDisposition; invocation: ModelInvocationContract; context: ModelRunContext };
type BeginInput = { agentRunId:string; invocationId:string; userId:string; taskId:string; agentId:string; prompt:string; idempotencyKey:string; requestFingerprint:string; provider:string; model:string; now:Date };

/** Server-only persistence state machine for MODEL AgentRuns. It never calls a provider. */
export class ModelInvocationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async beginForTask(input: BeginInput): Promise<BeginModelRun | ModelInvocationError> {
    try {
      return await this.prisma.$transaction(tx => this.beginInTransaction(tx, input), { isolationLevel: 'RepeatableRead' });
    } catch (error) {
      if (!isModelIdempotencyConflict(error)) throw error;
      return this.recoverIdempotency(input);
    }
  }

  async complete(input: { invocationId:string; providerResponseId?:string; outputText:string; model:string; inputTokens?:number; outputTokens?:number; totalTokens?:number; completedAt:Date }): Promise<ModelInvocationContract | 'INVALID_STATE_TRANSITION' | 'NOT_FOUND'> {
    return this.finalize(input.invocationId, 'COMPLETED', input.completedAt, input);
  }
  async fail(input: { invocationId:string; errorCode:string; completedAt:Date }): Promise<ModelInvocationContract | 'INVALID_STATE_TRANSITION' | 'NOT_FOUND'> {
    return this.finalize(input.invocationId, 'FAILED', input.completedAt, input);
  }

  async listForTaskForMember(input: { userId:string; taskId:string; limit?:number }): Promise<ModelInvocationContract[] | 'NOT_FOUND'> {
    const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
    return this.prisma.$transaction(async tx => {
      const task = await tx.task.findFirst({ where: { id: input.taskId, project: { members: { some: { userId: input.userId } } } } });
      if (!task || !(await activeOrganizationMember(tx, input.userId))) return 'NOT_FOUND';
      const rows = await tx.modelInvocation.findMany({ where: { agentRun: { taskId: task.id, projectId: task.projectId, kind: 'MODEL' } }, include:{agentRun:{include:{toolCalls:{orderBy:{sequence:'asc'}}}}}, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
      return rows.map(toContract);
    }, { isolationLevel: 'RepeatableRead' });
  }

  /** Executes one fixed, read-only model tool. Authorization and data are one RepeatableRead snapshot. */
  async executeReadTool(input:{invocationId:string;userId:string;name:'get_task_snapshot'|'list_task_artifacts';callId:string;argumentsJson:string;sequence:number}):Promise<{output:Record<string,unknown>}|'AUTHORIZATION_REVOKED'|'INVALID'> {
    return this.prisma.$transaction(async tx => {
      const invocation=await tx.modelInvocation.findUnique({where:{id:input.invocationId},include:{agentRun:true}});
      if(!invocation||invocation.status!=='RUNNING'||invocation.agentRun.kind!=='MODEL'||invocation.agentRun.userId!==input.userId) return 'INVALID';
      const authorization=await authorizeModelRun(tx,{userId:input.userId,taskId:invocation.agentRun.taskId,agentId:await definitionIdForRun(tx,invocation.agentRun.agentDefinitionKey,input.userId),prompt:invocation.inputText});
      if(typeof authorization==='string') return 'AUTHORIZATION_REVOKED';
      if(authorization.task.id!==invocation.agentRun.taskId||authorization.task.projectId!==invocation.agentRun.projectId) return 'AUTHORIZATION_REVOKED';
      let output:Record<string,unknown>;
      if(input.name==='get_task_snapshot') {
        const dependencies=await tx.taskDependency.findMany({where:{taskId:authorization.task.id,projectId:authorization.task.projectId},include:{dependsOnTask:true}});
        output={task:{id:authorization.task.id,title:authorization.task.title,description:authorization.task.description,status:authorization.task.status},dependencies:dependencies.map(row=>({taskId:row.dependsOnTask.id,title:row.dependsOnTask.title,status:row.dependsOnTask.status}))};
      } else {
        const artifacts=await tx.artifact.findMany({where:{taskId:authorization.task.id,projectId:authorization.task.projectId},orderBy:{createdAt:'desc'},take:20});
        output={artifacts:artifacts.map(row=>({artifactId:row.id,name:row.relativePath,kind:row.type,createdAt:row.createdAt.toISOString(),agentRunId:row.agentRunId}))};
      }
      const now=new Date(); await tx.agentToolCall.create({data:{id:input.callId,agentRunId:invocation.agentRunId,sequence:input.sequence,name:input.name,providerCallId:input.callId,request:{name:input.name,argumentsJson:input.argumentsJson},status:'SUCCEEDED',receipt:output as never,createdAt:now,completedAt:now}});
      return {output};
    },{isolationLevel:'RepeatableRead'});
  }

  private async beginInTransaction(tx: TransactionClient, input: BeginInput): Promise<BeginModelRun | ModelInvocationError> {
    const authorization = await authorizeModelRun(tx, input);
    if (typeof authorization === 'string') return authorization;
    const existing = await tx.modelInvocation.findUnique({ where: { initiatedByUserId_idempotencyKey: { initiatedByUserId: input.userId, idempotencyKey: input.idempotencyKey } } });
    if (existing) return existing.requestFingerprint === input.requestFingerprint ? { disposition: disposition(existing.status), invocation: toContract(existing), context: authorization.context } : 'IDEMPOTENCY_CONFLICT';
    const run = await tx.agentRun.create({ data: { id: input.agentRunId, userId: input.userId, projectId: authorization.task.projectId, taskId: authorization.task.id, agentDefinitionKey: authorization.definition.key, agentVersion: authorization.version.version, kind: 'MODEL', status: 'RUNNING', intent: { name: 'model_generate', inputHash: authorization.inputHash }, createdAt: input.now, startedAt: input.now, updatedAt: input.now } });
    const invocation = await tx.modelInvocation.create({ data: { id: input.invocationId, agentRunId: run.id, initiatedByUserId: input.userId, provider: input.provider, model: input.model, status: 'RUNNING', inputText: input.prompt, inputHash: authorization.inputHash, idempotencyKey: input.idempotencyKey, requestFingerprint: input.requestFingerprint, createdAt: input.now } });
    return { disposition: 'CREATED', invocation: toContract(invocation), context: authorization.context };
  }

  private async recoverIdempotency(input: BeginInput): Promise<BeginModelRun | ModelInvocationError> {
    return this.prisma.$transaction(async tx => {
      const authorization = await authorizeModelRun(tx, input);
      if (typeof authorization === 'string') return authorization;
      const existing = await tx.modelInvocation.findUnique({ where: { initiatedByUserId_idempotencyKey: { initiatedByUserId: input.userId, idempotencyKey: input.idempotencyKey } } });
      if (!existing) return 'NOT_FOUND';
      return existing.requestFingerprint === input.requestFingerprint ? { disposition: disposition(existing.status), invocation: toContract(existing), context: authorization.context } : 'IDEMPOTENCY_CONFLICT';
    }, { isolationLevel: 'RepeatableRead' });
  }

  private async finalize(invocationId:string, target:'COMPLETED'|'FAILED', completedAt:Date, data:{providerResponseId?:string;outputText?:string;model?:string;inputTokens?:number;outputTokens?:number;totalTokens?:number;errorCode?:string}): Promise<ModelInvocationContract | 'INVALID_STATE_TRANSITION' | 'NOT_FOUND'> {
    try {
      return await this.prisma.$transaction(async tx => {
        const current = await tx.modelInvocation.findUnique({ where: { id: invocationId }, include: { agentRun: true } });
        if (!current) return 'NOT_FOUND';
        if (target === 'COMPLETED' && current.model !== data.model) return 'INVALID_STATE_TRANSITION';
        if (current.status !== 'RUNNING') return sameTerminal(current, target, data) ? toContract(current as never) : 'INVALID_STATE_TRANSITION';
        const invocationWrite = await tx.modelInvocation.updateMany({ where: { id: current.id, status: 'RUNNING' }, data: { status: target, completedAt, ...(target === 'COMPLETED' ? { providerResponseId: data.providerResponseId, outputText: data.outputText, inputTokens: data.inputTokens, outputTokens: data.outputTokens, totalTokens: data.totalTokens } : { errorCode: data.errorCode }) } });
        if (invocationWrite.count !== 1) throw new FinalizeConflict();
        const runWrite = await tx.agentRun.updateMany({ where: { id: current.agentRunId, kind: 'MODEL', status: 'RUNNING' }, data: { status: target === 'COMPLETED' ? 'SUCCEEDED' : 'FAILED', finishedAt: completedAt, updatedAt: completedAt } });
        if (runWrite.count !== 1) throw new FinalizeConflict();
        return toContract(await tx.modelInvocation.findUniqueOrThrow({ where: { id: current.id }, include:{agentRun:{include:{toolCalls:{orderBy:{sequence:'asc'}}}}} }) as never);
      }, { isolationLevel: 'RepeatableRead' });
    } catch (error) {
      if (error instanceof FinalizeConflict) return 'INVALID_STATE_TRANSITION';
      throw error;
    }
  }
}

async function definitionIdForRun(tx:TransactionClient,key:string,userId:string):Promise<string>{const member=await activeOrganizationMember(tx,userId);if(!member)return '';const definition=await tx.agentDefinition.findFirst({where:{organizationId:member.organizationId,key}});return definition?.id??'';}

async function authorizeModelRun(tx: TransactionClient, input: Pick<BeginInput, 'userId'|'taskId'|'agentId'|'prompt'>) {
  const member = await activeOrganizationMember(tx, input.userId);
  if (!member) return 'FORBIDDEN' as const;
  const task = await tx.task.findFirst({ where: { id: input.taskId, project: { members: { some: { userId: input.userId } } } }, include: { project: true } });
  if (!task) return 'NOT_FOUND' as const;
  const definition = await tx.agentDefinition.findFirst({ where: { id: input.agentId, organizationId: member.organizationId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
  if (!definition || definition.status !== 'ACTIVE' || !definition.versions[0] || definition.versions[0].status !== 'ACTIVE') return 'AGENT_DISABLED' as const;
  const version = definition.versions[0];
  const scopes = [{ scopeType: 'ORGANIZATION' as const, scopeId: member.organizationId }, { scopeType: 'USER' as const, scopeId: input.userId }, ...(member.departmentMembership?.status === 'ACTIVE' ? [{ scopeType: 'DEPARTMENT' as const, scopeId: member.departmentMembership.departmentId }] : [])];
  if (!await tx.agentAssignment.findFirst({ where: { organizationId: member.organizationId, agentDefinitionId: definition.id, status: 'ACTIVE', OR: scopes } })) return 'AGENT_NOT_ASSIGNED' as const;
  const permission = await evaluatePermission(tx, { organizationId: member.organizationId, userId: input.userId, scopeType: member.departmentMembership?.status === 'ACTIVE' ? 'DEPARTMENT' : 'ORGANIZATION', scopeId: member.departmentMembership?.status === 'ACTIVE' ? member.departmentMembership.departmentId : member.organizationId, resource: 'AGENT', action: 'EXECUTE' });
  if (!permission.allowed) return 'AGENT_EXECUTE_DENIED' as const;
  return { task, definition, version, inputHash: modelInputHash(input.prompt), context: { organizationName: member.organization.name, projectName: task.project.name, taskTitle: task.title, ...(task.description ? { taskDescription: task.description } : {}), taskStatus: task.status, agentName: definition.name, ...(definition.description ? { agentDescription: definition.description } : {}), agentVersion: version.version } };
}
async function activeOrganizationMember(tx: PermissionDbClient, userId:string) { return tx.organizationMembership.findFirst({ where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' }, user: { account: { is: { status: 'ACTIVE' } } } }, include: { organization: true, departmentMembership: true } }); }
function disposition(status:'RUNNING'|'COMPLETED'|'FAILED'):BeginModelRunDisposition{return status==='RUNNING'?'EXISTING_RUNNING':status==='COMPLETED'?'EXISTING_COMPLETED':'EXISTING_FAILED';}
function toContract(row:{id:string;agentRunId:string;initiatedByUserId:string;provider:string;model:string;status:'RUNNING'|'COMPLETED'|'FAILED';inputText:string;outputText:string|null;providerResponseId:string|null;inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;errorCode:string|null;createdAt:Date;completedAt:Date|null;agentRun?:{toolCalls?:Array<{sequence:number;name:string;status:'PENDING'|'SUCCEEDED'|'FAILED'|'CANCELLED';createdAt:Date;completedAt:Date|null;receipt:unknown}>}}):ModelInvocationContract{return{id:row.id,agentRunId:row.agentRunId,initiatedByUserId:row.initiatedByUserId,provider:row.provider,model:row.model,status:row.status,inputText:row.inputText,...(row.outputText!==null?{outputText:row.outputText}:{}),...(row.providerResponseId!==null?{providerResponseId:row.providerResponseId}:{}),...(row.inputTokens!==null?{inputTokens:row.inputTokens}:{}),...(row.outputTokens!==null?{outputTokens:row.outputTokens}:{}),...(row.totalTokens!==null?{totalTokens:row.totalTokens}:{}),...(row.errorCode!==null?{errorCode:row.errorCode}:{}),createdAt:row.createdAt.toISOString(),...(row.completedAt?{completedAt:row.completedAt.toISOString()}: {}),...(row.agentRun?.toolCalls?{toolCalls:row.agentRun.toolCalls.map(call=>({sequence:call.sequence,name:call.name,status:call.status,startedAt:call.createdAt.toISOString(),...(call.completedAt?{completedAt:call.completedAt.toISOString()}: {})}))}:{})};}
function sameTerminal(row:{status:string;outputText:string|null;providerResponseId:string|null;inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;errorCode:string|null},target:'COMPLETED'|'FAILED',data:{outputText?:string;providerResponseId?:string;inputTokens?:number;outputTokens?:number;totalTokens?:number;errorCode?:string}){return row.status===target&&(target==='COMPLETED'?row.outputText===data.outputText&&row.providerResponseId===(data.providerResponseId??null)&&row.inputTokens===(data.inputTokens??null)&&row.outputTokens===(data.outputTokens??null)&&row.totalTokens===(data.totalTokens??null):row.errorCode===data.errorCode);}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
export function isModelIdempotencyConflict(error:unknown):boolean{if(!isRecord(error)||error.code!=='P2002'||!isRecord(error.meta)||!isRecord(error.meta.driverAdapterError)||!isRecord(error.meta.driverAdapterError.cause))return false;const cause=error.meta.driverAdapterError.cause;const fields=isRecord(cause.constraint)?cause.constraint.fields:undefined;return cause.kind==='UniqueConstraintViolation'&&Array.isArray(fields)&&fields.length===2&&fields[0]==='initiated_by_user_id'&&fields[1]==='idempotency_key';}
class FinalizeConflict extends Error {}
