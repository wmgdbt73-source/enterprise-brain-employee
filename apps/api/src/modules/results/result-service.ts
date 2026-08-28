import { randomUUID } from 'node:crypto';
import type { ResultContract } from '@enterprise-brain/contracts';
import type { ResultRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';

export class ResultNotFoundError extends Error {}
export class ResultIdempotencyConflictError extends Error {}

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
}
