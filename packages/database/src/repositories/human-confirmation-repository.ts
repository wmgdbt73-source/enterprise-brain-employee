import type { ApprovedWriteExecutionGrant, HumanConfirmationContract } from '@enterprise-brain/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';

export class HumanConfirmationRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async decide(id: string, userId: string, decision: 'APPROVE' | 'REJECT'): Promise<{ confirmation: HumanConfirmationContract; grant?: ApprovedWriteExecutionGrant } | 'NOT_FOUND' | 'CONFLICT'> {
    return this.prisma.$transaction(async tx => {
      const confirmation = await tx.humanConfirmation.findFirst({ where: { id, userId, agentRun: { project: { members: { some: { userId } } } } }, include: { agentRun: true, toolCall: true } });
      if (!confirmation) return 'NOT_FOUND';
      const desired = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      if (confirmation.status !== 'PENDING') return confirmation.status === desired ? { confirmation: toContract(confirmation), ...(grantFor(confirmation) ? { grant: grantFor(confirmation)! } : {}) } : 'CONFLICT';
      if (confirmation.agentRun.status !== 'WAITING_HUMAN' || confirmation.toolCall.status !== 'PENDING' || confirmation.toolCall.name !== 'write_file' || confirmation.toolCall.deviceId !== confirmation.deviceId) return 'CONFLICT';
      const now = new Date();
      const won = await tx.humanConfirmation.updateMany({ where: { id, status: 'PENDING' }, data: { status: desired, decidedAt: now } });
      if (!won.count) throw new Error('confirmation CAS conflict');
      if (decision === 'APPROVE') await tx.agentRun.update({ where: { id: confirmation.agentRunId }, data: { status: 'RUNNING', startedAt: now, updatedAt: now } });
      else { await tx.agentToolCall.update({ where: { id: confirmation.toolCallId }, data: { status: 'CANCELLED', completedAt: now } }); await tx.agentRun.update({ where: { id: confirmation.agentRunId }, data: { status: 'CANCELLED', finishedAt: now, updatedAt: now } }); }
      const updated = await tx.humanConfirmation.findUniqueOrThrow({ where: { id }, include: { agentRun: true, toolCall: true } });
      return { confirmation: toContract(updated), ...(grantFor(updated) ? { grant: grantFor(updated)! } : {}) };
    });
  }
  async findForUser(id: string, userId: string): Promise<HumanConfirmationContract | undefined> {
    const c = await this.prisma.humanConfirmation.findFirst({ where: { id, userId, agentRun: { project: { members: { some: { userId } } } } } });
    return c ? toContract(c) : undefined;
  }
}
function toContract(c: { id:string; agentRunId:string; toolCallId:string; userId:string; projectId:string; taskId:string; status:'PENDING'|'APPROVED'|'REJECTED'; createdAt:Date; decidedAt:Date|null }): HumanConfirmationContract { return { id:c.id, agentRunId:c.agentRunId, toolCallId:c.toolCallId, userId:c.userId, projectId:c.projectId, taskId:c.taskId, status:c.status, createdAt:c.createdAt.toISOString(), ...(c.decidedAt?{decidedAt:c.decidedAt.toISOString()}: {}) }; }
function grantFor(c: { id:string; agentRunId:string; toolCallId:string; userId:string; projectId:string; taskId:string; deviceId:string; status:string; agentRun:{status:string}; toolCall:{status:string; request:unknown} }): ApprovedWriteExecutionGrant | undefined { if (c.status !== 'APPROVED' || c.agentRun.status !== 'RUNNING' || c.toolCall.status !== 'PENDING') return; const r = c.toolCall.request; if (!isWrite(r) || r.deviceId !== c.deviceId) return; return { confirmationId:c.id, agentRunId:c.agentRunId, toolCallId:c.toolCallId, userId:c.userId, projectId:c.projectId, taskId:c.taskId, deviceId:c.deviceId, relativePath:r.relativePath, payloadSize:r.payloadSize, payloadSha256:r.payloadSha256, effect:r.effect, ...(r.expectedCurrentSha256?{expectedCurrentSha256:r.expectedCurrentSha256}:{}) }; }
function isWrite(value: unknown): value is { name:'write_file'; deviceId:string; relativePath:string; payloadSize:number; payloadSha256:string; effect:'CREATE'|'REPLACE'; expectedCurrentSha256?:string } { return typeof value === 'object' && value !== null && (value as Record<string,unknown>).name === 'write_file' && typeof (value as Record<string,unknown>).deviceId === 'string' && typeof (value as Record<string,unknown>).relativePath === 'string' && typeof (value as Record<string,unknown>).payloadSize === 'number' && typeof (value as Record<string,unknown>).payloadSha256 === 'string' && ((value as Record<string,unknown>).effect === 'CREATE' || (value as Record<string,unknown>).effect === 'REPLACE'); }
