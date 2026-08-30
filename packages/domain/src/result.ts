import type { ResultStatus, ReviewDecision } from '@enterprise-brain/contracts';
import { DomainError } from './errors.js';
import type { ArtifactId, ProjectId, ResultId, TaskId, UserId } from './ids.js';

export interface Result {
  readonly id: ResultId;
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly artifactIds: readonly ArtifactId[];
  readonly status: ResultStatus;
  readonly createdByUserId: UserId;
  readonly submittedByUserId?: UserId;
  readonly submittedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function createResultCandidate(input: Omit<Result, 'status' | 'createdAt' | 'updatedAt'>, now: Date): Result {
  validateArtifactIds(input.artifactIds);
  return Object.freeze({ ...input, artifactIds: Object.freeze([...input.artifactIds]), status: 'CANDIDATE' as const, createdAt: new Date(now), updatedAt: new Date(now) });
}

/** Trusted persistence boundary; HTTP/LLM input must only use createResultCandidate. */
export function rehydrateResult(input: Result): Result {
  validateArtifactIds(input.artifactIds);
  if (!isResultStatus(input.status) || Number.isNaN(input.createdAt.getTime()) || Number.isNaN(input.updatedAt.getTime()) || (input.submittedAt && Number.isNaN(input.submittedAt.getTime())))
    throw new DomainError('INVALID_ARGUMENT', 'Invalid persisted Result');
  return Object.freeze({ ...input, artifactIds: Object.freeze([...input.artifactIds]), createdAt: new Date(input.createdAt), updatedAt: new Date(input.updatedAt), ...(input.submittedAt ? { submittedAt: new Date(input.submittedAt) } : {}) });
}
export function submitResultForHumanReview(result: Result, submittedByUserId: UserId, now: Date): Result {
  if (result.status !== 'CANDIDATE') throw new DomainError('INVALID_STATE_TRANSITION', 'Only CANDIDATE Results can be submitted for Human Review');
  return Object.freeze({ ...result, status: 'HUMAN_REVIEW' as const, submittedByUserId, submittedAt: new Date(now), updatedAt: new Date(now) });
}
export function decideResultReview(result: Result, decision: ReviewDecision, now: Date): Result {
  if (result.status !== 'HUMAN_REVIEW') throw new DomainError('INVALID_STATE_TRANSITION', 'Only HUMAN_REVIEW Results can be decided');
  return Object.freeze({ ...result, status: decision === 'ACCEPT' ? 'ACCEPTED' as const : 'REWORK' as const, updatedAt: new Date(now) });
}
function validateArtifactIds(ids: readonly ArtifactId[]): void {
  if (ids.length === 0) throw new DomainError('INVALID_ARGUMENT', 'artifactIds must not be empty');
  if (new Set(ids).size !== ids.length) throw new DomainError('INVALID_ARGUMENT', 'artifactIds must not contain duplicates');
}
function isResultStatus(value: string): value is ResultStatus {
  return ['DRAFT', 'CANDIDATE', 'HUMAN_REVIEW', 'ACCEPTED', 'REWORK'].includes(value);
}
