import { createHash } from 'node:crypto';
import type { ResultContract, ReviewContract, ReviewDecision } from '@enterprise-brain/contracts';
import { applyTaskAction, asArtifactId, asProjectId, asResultId, asTaskId, asUserId, createResultCandidate, decideResultReview, rehydrateResult, rehydrateTask, submitResultForHumanReview } from '@enterprise-brain/domain';
import type { PrismaClient } from '../generated/prisma/client.js';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;
export type ResultCreation =
  | { result: ResultContract; created: boolean }
  | 'NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT';
export type ResultReviewAction =
  | { review: ReviewContract; created: boolean }
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'CONFLICT';

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

  async submitForReviewForCreator(resultId: string, userId: string, now: Date): Promise<ResultContract | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE'> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const result = await tx.result.findFirst({ where: { id: resultId, project: { members: { some: { userId } } } } });
      if (!result) return 'NOT_FOUND';
      if (result.createdByUserId !== userId) return 'FORBIDDEN';
      const links = await tx.resultArtifact.findMany({ where: { resultId }, orderBy: { artifactId: 'asc' } });
      const task = await tx.task.findUnique({ where: { id: result.taskId } });
      if (!task || task.projectId !== result.projectId) return 'INVALID_STATE';
      if (result.status === 'HUMAN_REVIEW') return task.status === 'READY_FOR_REVIEW' ? toContract(result, links.map((link) => link.artifactId)) : 'INVALID_STATE';
      if (result.status !== 'CANDIDATE') return 'INVALID_STATE';
      if (task.status !== 'IN_PROGRESS') return 'INVALID_STATE';
      const transitioned = submitResultForHumanReview(toDomain(result, links.map((link) => link.artifactId)), asUserId(userId), now);
      const transitionedTask = applyTaskAction(toTaskDomain(task), 'SUBMIT_FOR_REVIEW', now);
      const updated = await tx.result.updateMany({ where: { id: resultId, status: 'CANDIDATE' }, data: { status: transitioned.status, submittedByUserId: userId, submittedAt: transitioned.submittedAt, updatedAt: transitioned.updatedAt } });
      if (updated.count !== 1) throw new SubmissionCasConflict();
      if ((await tx.task.updateMany({ where: { id: task.id, status: 'IN_PROGRESS' }, data: { status: transitionedTask.status, updatedAt: transitionedTask.updatedAt } })).count !== 1) throw new SubmissionCasConflict();
      return toContract({ ...result, status: transitioned.status, submittedByUserId: userId, submittedAt: transitioned.submittedAt!, updatedAt: transitioned.updatedAt }, links.map((link) => link.artifactId));
      }, { isolationLevel: 'RepeatableRead' });
    } catch (error) {
      if (!(error instanceof SubmissionCasConflict) && !isSerializationConflict(error)) throw error;
      const result = await this.findForUser(resultId, userId);
      if (!result) return 'NOT_FOUND';
      return result.status === 'HUMAN_REVIEW' && result.createdByUserId === userId ? result : 'INVALID_STATE';
    }
  }

  async decideForReviewer(input: { resultId: string; reviewerId: string; decision: ReviewDecision; comment?: string; reviewId: string; now: Date }): Promise<ResultReviewAction> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const result = await tx.result.findFirst({ where: { id: input.resultId, project: { members: { some: { userId: input.reviewerId } } } } });
      if (!result) return 'NOT_FOUND';
      const membership = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: result.projectId, userId: input.reviewerId } } });
      if (!membership || result.createdByUserId === input.reviewerId || (membership.role !== 'OWNER' && membership.role !== 'REVIEWER')) return 'FORBIDDEN';
      const organizationMembership = await tx.organizationMembership.findFirst({ where: { userId: input.reviewerId, status: 'ACTIVE', organization: { status: 'ACTIVE' } } });
      const override = organizationMembership ? await tx.permissionOverride.findFirst({ where: { organizationId: organizationMembership.organizationId, userId: input.reviewerId, resource: 'RESULT', action: 'REVIEW', scopeType: 'ORGANIZATION', scopeId: organizationMembership.organizationId } }) : undefined;
      if (override?.effect === 'DENY') return 'FORBIDDEN';
      const existing = await tx.review.findUnique({ where: { resultId: result.id } });
      if (existing) return sameReviewRequest(existing, input) ? { review: toReviewContract(existing), created: false } : 'CONFLICT';
      if (result.status !== 'HUMAN_REVIEW') return 'INVALID_STATE';
      const task = await tx.task.findUnique({ where: { id: result.taskId } });
      if (!task || task.projectId !== result.projectId || task.status !== 'READY_FOR_REVIEW') return 'INVALID_STATE';
      const links = await tx.resultArtifact.findMany({ where: { resultId: result.id }, orderBy: { artifactId: 'asc' } });
      const transitioned = decideResultReview(toDomain(result, links.map((link) => link.artifactId)), input.decision, input.now);
      const transitionedTask = applyTaskAction(toTaskDomain(task), input.decision === 'ACCEPT' ? 'ACCEPT_AFTER_HUMAN_REVIEW' : 'REQUEST_REWORK', input.now);
      const updated = await tx.result.updateMany({ where: { id: result.id, status: 'HUMAN_REVIEW' }, data: { status: transitioned.status, updatedAt: transitioned.updatedAt } });
      if (updated.count !== 1) throw new ReviewCasConflict();
      if ((await tx.task.updateMany({ where: { id: task.id, status: 'READY_FOR_REVIEW' }, data: { status: transitionedTask.status, updatedAt: transitionedTask.updatedAt } })).count !== 1) throw new ReviewCasConflict();
      const review = await tx.review.create({ data: { id: input.reviewId, resultId: result.id, projectId: result.projectId, reviewerId: input.reviewerId, decision: input.decision, ...(input.comment ? { comment: input.comment } : {}), reviewedAt: input.now } });
      return { review: toReviewContract(review), created: true };
      }, { isolationLevel: 'RepeatableRead' });
    } catch (error) {
      if (!(error instanceof ReviewCasConflict) && !isReviewCompetition(error)) throw error;
      return this.recoverReviewDecision(input);
    }
  }

  private async recoverReviewDecision(input: { resultId: string; reviewerId: string; decision: ReviewDecision; comment?: string }): Promise<ResultReviewAction> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.result.findFirst({ where: { id: input.resultId, project: { members: { some: { userId: input.reviewerId } } } } });
      if (!result) return 'NOT_FOUND';
      const membership = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: result.projectId, userId: input.reviewerId } } });
      if (!membership || result.createdByUserId === input.reviewerId || (membership.role !== 'OWNER' && membership.role !== 'REVIEWER')) return 'FORBIDDEN';
      const organizationMembership = await tx.organizationMembership.findFirst({ where: { userId: input.reviewerId, status: 'ACTIVE', organization: { status: 'ACTIVE' } } });
      const override = organizationMembership ? await tx.permissionOverride.findFirst({ where: { organizationId: organizationMembership.organizationId, userId: input.reviewerId, resource: 'RESULT', action: 'REVIEW', scopeType: 'ORGANIZATION', scopeId: organizationMembership.organizationId } }) : undefined;
      if (override?.effect === 'DENY') return 'FORBIDDEN';
      const review = await tx.review.findUnique({ where: { resultId: result.id } });
      if (!review) return 'CONFLICT';
      return sameReviewRequest(review, input)
        ? { review: toReviewContract(review), created: false }
        : 'CONFLICT';
    }, { isolationLevel: 'RepeatableRead' });
  }

  async listReviewsForUser(resultId: string, userId: string): Promise<ReviewContract[] | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.result.findFirst({ where: { id: resultId, project: { members: { some: { userId } } } } });
      if (!result) return undefined;
      const reviews = await tx.review.findMany({ where: { resultId }, orderBy: { reviewedAt: 'asc' } });
      return reviews.map(toReviewContract);
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

export function canonicalArtifactIds(ids: string[]): string[] { return [...ids].sort(compareArtifactIds); }
/** Deliberate code-unit order: independent of database collation and locale. */
export function compareArtifactIds(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
export function requestFingerprint(taskId: string, artifactIds: string[]): string {
  return createHash('sha256').update(JSON.stringify({ version: 1, taskId, artifactIds })).digest('hex');
}
function toContract(result: { id: string; projectId: string; taskId: string; createdByUserId: string; submittedByUserId?: string | null; submittedAt?: Date | null; status: ResultContract['status']; createdAt: Date; updatedAt: Date }, artifactIds: string[]): ResultContract {
  return { id: result.id, projectId: result.projectId, taskId: result.taskId, artifactIds, status: result.status, createdByUserId: result.createdByUserId, ...(result.submittedByUserId ? { submittedByUserId: result.submittedByUserId } : {}), ...(result.submittedAt ? { submittedAt: result.submittedAt.toISOString() } : {}), createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString() };
}
function toDomain(result: { id: string; projectId: string; taskId: string; createdByUserId: string; submittedByUserId?: string | null; submittedAt?: Date | null; status: ResultContract['status']; createdAt: Date; updatedAt: Date }, artifactIds: string[]) {
  return rehydrateResult({ id: asResultId(result.id), projectId: asProjectId(result.projectId), taskId: asTaskId(result.taskId), artifactIds: artifactIds.map(asArtifactId), status: result.status, createdByUserId: asUserId(result.createdByUserId), ...(result.submittedByUserId ? { submittedByUserId: asUserId(result.submittedByUserId) } : {}), ...(result.submittedAt ? { submittedAt: result.submittedAt } : {}), createdAt: result.createdAt, updatedAt: result.updatedAt });
}
function toTaskDomain(task: { id: string; projectId: string; title: string; description: string | null; priority: 'P0' | 'P1' | 'P2' | 'P3'; status: 'TODO' | 'IN_PROGRESS' | 'READY_FOR_REVIEW' | 'ACCEPTED' | 'CLOSED'; acceptanceCriteria: string[]; deadline: Date | null; createdAt: Date; updatedAt: Date }) {
  return rehydrateTask({ id: asTaskId(task.id), projectId: asProjectId(task.projectId), title: task.title, description: task.description ?? undefined, priority: task.priority, status: task.status, acceptanceCriteria: task.acceptanceCriteria, dependencyIds: [], deadline: task.deadline ?? undefined, createdAt: task.createdAt, updatedAt: task.updatedAt });
}
function toReviewContract(review: { id: string; resultId: string; reviewerId: string; decision: ReviewDecision; comment: string | null; reviewedAt: Date }): ReviewContract {
  return { id: review.id, resultId: review.resultId, reviewerId: review.reviewerId, decision: review.decision, ...(review.comment ? { comment: review.comment } : {}), reviewedAt: review.reviewedAt.toISOString() };
}
function sameReviewRequest(review: { reviewerId: string; decision: ReviewDecision; comment: string | null }, input: { reviewerId: string; decision: ReviewDecision; comment?: string }): boolean {
  return review.reviewerId === input.reviewerId && review.decision === input.decision && review.comment === (input.comment ?? null);
}
export function isResultIdempotencyConflict(error: unknown): boolean {
  if (!isRecord(error) || error.code !== 'P2002' || !isRecord(error.meta) || !isRecord(error.meta.driverAdapterError) || !isRecord(error.meta.driverAdapterError.cause)) return false;
  const cause = error.meta.driverAdapterError.cause;
  const fields = isRecord(cause.constraint) ? cause.constraint.fields : undefined;
  return cause.kind === 'UniqueConstraintViolation' && Array.isArray(fields) && fields.length === 3 && fields[0] === 'created_by_user_id' && fields[1] === 'task_id' && fields[2] === 'idempotency_key';
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
class SubmissionCasConflict extends Error {}
class ReviewCasConflict extends Error {}
function isSerializationConflict(error: unknown): boolean { return isRecord(error) && error.code === 'P2034'; }
function isReviewCompetition(error: unknown): boolean {
  if (isSerializationConflict(error)) return true;
  if (!isRecord(error) || error.code !== 'P2002' || !isRecord(error.meta) || !isRecord(error.meta.driverAdapterError) || !isRecord(error.meta.driverAdapterError.cause)) return false;
  const cause = error.meta.driverAdapterError.cause;
  const fields = isRecord(cause.constraint) ? cause.constraint.fields : undefined;
  return cause.kind === 'UniqueConstraintViolation' && Array.isArray(fields) && fields.length === 1 && fields[0] === 'result_id';
}
