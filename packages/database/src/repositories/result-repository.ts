import { createHash } from 'node:crypto';
import type { ResultContract } from '@enterprise-brain/contracts';
import { asArtifactId, asProjectId, asResultId, asTaskId, asUserId, createResultCandidate } from '@enterprise-brain/domain';
import type { PrismaClient } from '../generated/prisma/client.js';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;
export type ResultCreation =
  | { result: ResultContract; created: boolean }
  | 'NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT';

export class ResultRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForTaskForUser(input: {
    resultId: string; taskId: string; userId: string; artifactIds: string[];
    idempotencyKey: string; now: Date;
  }): Promise<ResultCreation> {
    const artifactIds = canonicalArtifactIds(input.artifactIds);
    const fingerprint = requestFingerprint(input.taskId, artifactIds);
    try {
      return await this.prisma.$transaction(
        (tx) => this.createInTransaction(tx, { ...input, artifactIds, fingerprint }),
        { isolationLevel: 'RepeatableRead' }
      );
    } catch (error) {
      if (!isResultIdempotencyConflict(error)) throw error;
      const existing = await this.findForIdempotencyKey(input.taskId, input.userId, input.idempotencyKey);
      if (!existing) return 'NOT_FOUND';
      return existing.requestFingerprint === fingerprint
        ? { result: existing.result, created: false }
        : 'IDEMPOTENCY_CONFLICT';
    }
  }

  async findForUser(resultId: string, userId: string): Promise<ResultContract | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.result.findFirst({
        where: { id: resultId, project: { members: { some: { userId } } } }
      });
      if (!result) return undefined;
      const links = await tx.resultArtifact.findMany({
        where: { resultId: result.id }, orderBy: { artifactId: 'asc' }
      });
      return toContract(result, links.map((link) => link.artifactId));
    }, { isolationLevel: 'RepeatableRead' });
  }

  private async createInTransaction(
    tx: TransactionClient,
    input: { resultId: string; taskId: string; userId: string; artifactIds: string[]; idempotencyKey: string; now: Date; fingerprint: string }
  ): Promise<ResultCreation> {
    const task = await tx.task.findFirst({
      where: { id: input.taskId, project: { members: { some: { userId: input.userId } } } }
    });
    if (!task) return 'NOT_FOUND';
    const artifacts = await tx.artifact.findMany({
      where: { id: { in: input.artifactIds }, taskId: task.id, projectId: task.projectId },
      select: { id: true }
    });
    if (artifacts.length !== input.artifactIds.length) return 'NOT_FOUND';
    const candidate = createResultCandidate({
      id: asResultId(input.resultId), projectId: asProjectId(task.projectId), taskId: asTaskId(task.id),
      artifactIds: input.artifactIds.map(asArtifactId), createdByUserId: asUserId(input.userId)
    }, input.now);
    const created = await tx.result.create({ data: {
      id: candidate.id, projectId: candidate.projectId, taskId: candidate.taskId,
      createdByUserId: candidate.createdByUserId, status: candidate.status,
      idempotencyKey: input.idempotencyKey, requestFingerprint: input.fingerprint,
      createdAt: candidate.createdAt, updatedAt: candidate.updatedAt
    } });
    await tx.resultArtifact.createMany({ data: input.artifactIds.map((artifactId) => ({
      resultId: created.id, artifactId, taskId: created.taskId, projectId: created.projectId
    })) });
    return { result: toContract(created, input.artifactIds), created: true };
  }

  private async findForIdempotencyKey(taskId: string, userId: string, idempotencyKey: string): Promise<{ result: ResultContract; requestFingerprint: string } | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.result.findFirst({
        where: { taskId, createdByUserId: userId, idempotencyKey, project: { members: { some: { userId } } } }
      });
      if (!result) return undefined;
      const links = await tx.resultArtifact.findMany({ where: { resultId: result.id }, orderBy: { artifactId: 'asc' } });
      return { result: toContract(result, links.map((link) => link.artifactId)), requestFingerprint: result.requestFingerprint };
    }, { isolationLevel: 'RepeatableRead' });
  }
}

function canonicalArtifactIds(ids: string[]): string[] { return [...ids].sort((a, b) => a.localeCompare(b)); }
export function requestFingerprint(taskId: string, artifactIds: string[]): string {
  return createHash('sha256').update(JSON.stringify({ version: 1, taskId, artifactIds })).digest('hex');
}
function toContract(result: { id: string; projectId: string; taskId: string; createdByUserId: string; status: ResultContract['status']; createdAt: Date; updatedAt: Date }, artifactIds: string[]): ResultContract {
  return { id: result.id, projectId: result.projectId, taskId: result.taskId, artifactIds, status: result.status, createdByUserId: result.createdByUserId, createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString() };
}
export function isResultIdempotencyConflict(error: unknown): boolean {
  if (!isRecord(error) || error.code !== 'P2002' || !isRecord(error.meta) || !isRecord(error.meta.driverAdapterError) || !isRecord(error.meta.driverAdapterError.cause)) return false;
  const cause = error.meta.driverAdapterError.cause;
  const fields = isRecord(cause.constraint) ? cause.constraint.fields : undefined;
  return cause.kind === 'UniqueConstraintViolation' && Array.isArray(fields) && fields.length === 3 && fields[0] === 'created_by_user_id' && fields[1] === 'task_id' && fields[2] === 'idempotency_key';
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
