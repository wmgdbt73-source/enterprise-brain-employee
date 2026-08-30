import { randomUUID } from 'node:crypto';
import type { ResultContract, ReviewContract, ReviewDecision } from '@enterprise-brain/contracts';
import type { ResultRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';

export class ResultNotFoundError extends Error {}
export class ResultIdempotencyConflictError extends Error {}
export class ResultReviewForbiddenError extends Error {}
export class ResultStateConflictError extends Error {}
export class ResultReviewConflictError extends Error {}

export class ResultService {
  constructor(private readonly results: ResultRepository) {}

  async create(context: RequestContext, taskId: string, artifactIds: string[], idempotencyKey: string): Promise<{ result: ResultContract; created: boolean }> {
    const result = await this.results.createForTaskForUser({
      resultId: randomUUID(), taskId, userId: context.currentUser.id, artifactIds, idempotencyKey, now: new Date()
    });
    if (result === 'NOT_FOUND') throw new ResultNotFoundError();
    if (result === 'IDEMPOTENCY_CONFLICT') throw new ResultIdempotencyConflictError();
    return result;
  }

  async get(context: RequestContext, resultId: string): Promise<ResultContract> {
    const result = await this.results.findForUser(resultId, context.currentUser.id);
    if (!result) throw new ResultNotFoundError();
    return result;
  }

  async submitForReview(context: RequestContext, resultId: string): Promise<ResultContract> {
    const result = await this.results.submitForReviewForCreator(resultId, context.currentUser.id, new Date());
    if (result === 'NOT_FOUND') throw new ResultNotFoundError();
    if (result === 'FORBIDDEN') throw new ResultReviewForbiddenError();
    if (result === 'INVALID_STATE') throw new ResultStateConflictError();
    return result;
  }

  async decide(context: RequestContext, resultId: string, decision: ReviewDecision, comment?: string): Promise<{ review: ReviewContract; created: boolean }> {
    const normalizedComment = comment?.trim() || undefined;
    const result = await this.results.decideForReviewer({ resultId, reviewerId: context.currentUser.id, decision, comment: normalizedComment, reviewId: randomUUID(), now: new Date() });
    if (result === 'NOT_FOUND') throw new ResultNotFoundError();
    if (result === 'FORBIDDEN') throw new ResultReviewForbiddenError();
    if (result === 'INVALID_STATE') throw new ResultStateConflictError();
    if (result === 'CONFLICT') throw new ResultReviewConflictError();
    return result;
  }

  async listReviews(context: RequestContext, resultId: string): Promise<ReviewContract[]> {
    const reviews = await this.results.listReviewsForUser(resultId, context.currentUser.id);
    if (!reviews) throw new ResultNotFoundError();
    return reviews;
  }
}
