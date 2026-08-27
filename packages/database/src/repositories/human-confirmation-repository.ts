import { normalizeToolCompletion, normalizeWriteToolRequest, type ApprovedWriteExecutionGrant, type HumanConfirmationContract, type HumanConfirmationDetailContract } from '@enterprise-brain/contracts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

type Decision = 'APPROVE' | 'REJECT';
type Decided = { confirmation: HumanConfirmationContract; grant?: ApprovedWriteExecutionGrant };
type ConfirmationWithRelations = Prisma.HumanConfirmationGetPayload<{ include: { agentRun: true; toolCall: true } }>;
type ScopedClient = PrismaClient | Prisma.TransactionClient;
/** Owns server-side confirmation decisions. Each state write is a CAS in one transaction. */
export class HumanConfirmationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async decide(id: string, userId: string, decision: Decision): Promise<Decided | 'NOT_FOUND' | 'CONFLICT'> {
    try {
      return await this.prisma.$transaction(async tx => {
        const confirmation = await scoped(tx, id, userId);
        if (!confirmation) return 'NOT_FOUND';
        const desired = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        if (confirmation.status !== 'PENDING') return terminalDecision(confirmation, desired);
        if (!isEligiblePending(confirmation)) return 'CONFLICT';
        const now = new Date();
        if ((await tx.humanConfirmation.updateMany({ where: { id, status: 'PENDING' }, data: { status: desired, decidedAt: now } })).count !== 1)
          throw new DecisionCasConflict();
        if (decision === 'APPROVE') {
          if ((await tx.agentRun.updateMany({ where: { id: confirmation.agentRunId, status: 'WAITING_HUMAN' }, data: { status: 'RUNNING', startedAt: now, updatedAt: now } })).count !== 1)
            throw new DecisionCasConflict();
        } else {
          if ((await tx.agentToolCall.updateMany({ where: { id: confirmation.toolCallId, agentRunId: confirmation.agentRunId, status: 'PENDING' }, data: { status: 'CANCELLED', completedAt: now } })).count !== 1 ||
              (await tx.agentRun.updateMany({ where: { id: confirmation.agentRunId, status: 'WAITING_HUMAN' }, data: { status: 'CANCELLED', finishedAt: now, updatedAt: now } })).count !== 1)
            throw new DecisionCasConflict();
        }
        const updated = await scoped(tx, id, userId);
        if (!updated) throw new DecisionCasConflict();
        return withOptionalGrant(updated);
      });
    } catch (error) {
      if (!(error instanceof DecisionCasConflict)) throw error;
      // The failed transaction is aborted; classify only via a fresh authorization-scoped read.
      const durable = await scoped(this.prisma, id, userId);
      if (!durable) return 'NOT_FOUND';
      const desired = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      if (durable.status === desired && isConsistentTerminal(durable, decision)) return withOptionalGrant(durable);
      return 'CONFLICT';
    }
  }

  async findForUser(id: string, userId: string): Promise<HumanConfirmationContract | undefined> {
    const confirmation = await scoped(this.prisma, id, userId);
    return confirmation ? toContract(confirmation) : undefined;
  }

  async findDetailForUser(id: string, userId: string): Promise<HumanConfirmationDetailContract | undefined> {
    const confirmation = await scoped(this.prisma, id, userId);
    return confirmation ? toDetail(confirmation) : undefined;
  }
}

async function scoped(client: ScopedClient, id: string, userId: string): Promise<ConfirmationWithRelations | null> {
  return client.humanConfirmation.findFirst({
    where: { id, userId, agentRun: { project: { members: { some: { userId } } } } },
    include: { agentRun: true, toolCall: true }
  });
}
function isEligiblePending(c: ConfirmationWithRelations): boolean {
  const request = normalizeWriteToolRequest(c.toolCall.request);
  return c.agentRun.status === 'WAITING_HUMAN' && c.toolCall.status === 'PENDING' && c.toolCall.name === 'write_file' &&
    c.toolCall.deviceId === c.deviceId && !!request && request.id === c.toolCallId && request.runId === c.agentRunId &&
    request.userId === c.userId && request.projectId === c.projectId && request.deviceId === c.deviceId;
}
function isConsistentTerminal(c: ConfirmationWithRelations, decision: Decision): boolean {
  if (decision === 'REJECT') return c.agentRun.status === 'CANCELLED' && c.toolCall.status === 'CANCELLED';
  if (!hasMatchingWriteProvenance(c)) return false;
  if (c.agentRun.status === 'RUNNING' && c.toolCall.status === 'PENDING') return true;
  const completion = normalizeToolCompletion(c.toolCall.request, c.toolCall.receipt);
  return (c.agentRun.status === 'SUCCEEDED' && c.toolCall.status === 'SUCCEEDED' && completion.kind === 'WRITE_FILE_SUCCESS') ||
    (c.agentRun.status === 'FAILED' && c.toolCall.status === 'FAILED' && completion.kind === 'FAILED');
}
function terminalDecision(c: ConfirmationWithRelations, desired: 'APPROVED' | 'REJECTED'): Decided | 'CONFLICT' {
  return c.status === desired && isConsistentTerminal(c, desired === 'APPROVED' ? 'APPROVE' : 'REJECT') ? withOptionalGrant(c) : 'CONFLICT';
}
function isEligibleApproved(c: ConfirmationWithRelations): boolean {
  return c.status === 'APPROVED' && c.agentRun.status === 'RUNNING' && c.toolCall.status === 'PENDING' && hasMatchingWriteProvenance(c);
}
function hasMatchingWriteProvenance(c: ConfirmationWithRelations): boolean {
  const request = normalizeWriteToolRequest(c.toolCall.request);
  return c.toolCall.name === 'write_file' && c.toolCall.deviceId === c.deviceId && !!request &&
    request.id === c.toolCallId && request.runId === c.agentRunId && request.userId === c.userId &&
    request.projectId === c.projectId && request.deviceId === c.deviceId;
}
function toDetail(c: ConfirmationWithRelations): HumanConfirmationDetailContract | undefined {
  const request = normalizeWriteToolRequest(c.toolCall.request);
  if (!request || !hasMatchingWriteProvenance(c)) return undefined;
  const create = request.effect === 'CREATE';
  return { confirmation: toContract(c), action: 'write_file', relativePath: request.relativePath, effect: request.effect,
    payloadSize: request.payloadSize, payloadSha256: request.payloadSha256,
    risk: create ? 'MEDIUM' : 'HIGH', reason: create ? 'Create a new local workspace file.' : 'Replace an existing local workspace file.',
    requiredPermission: create ? 'LOCAL_CREATE' : 'LOCAL_MODIFY' };
}
function withOptionalGrant(c: ConfirmationWithRelations): Decided {
  const confirmation = toContract(c);
  if (!isEligibleApproved(c)) return { confirmation };
  const request = normalizeWriteToolRequest(c.toolCall.request)!;
  return { confirmation, grant: { confirmationId: c.id, agentRunId: c.agentRunId, toolCallId: c.toolCallId,
    userId: c.userId, projectId: c.projectId, taskId: c.taskId, deviceId: c.deviceId,
    relativePath: request.relativePath, payloadSize: request.payloadSize, payloadSha256: request.payloadSha256,
    effect: request.effect, ...(request.expectedCurrentSha256 ? { expectedCurrentSha256: request.expectedCurrentSha256 } : {}) } };
}
function toContract(c: ConfirmationWithRelations): HumanConfirmationContract {
  return { id: c.id, agentRunId: c.agentRunId, toolCallId: c.toolCallId, userId: c.userId, projectId: c.projectId,
    taskId: c.taskId, status: c.status, createdAt: c.createdAt.toISOString(), ...(c.decidedAt ? { decidedAt: c.decidedAt.toISOString() } : {}) };
}
class DecisionCasConflict extends Error {}
