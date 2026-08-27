import { randomUUID } from 'node:crypto';
import type { ResultContract } from '@enterprise-brain/contracts';
import type { ResultRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';
export class ResultNotFoundError extends Error {}
export class ResultInvalidStateError extends Error {}
export class ResultService {
  constructor(private readonly results: ResultRepository) {}
  async create(context: RequestContext, taskId: string, artifactIds: string[]): Promise<ResultContract> { if (artifactIds.length === 0 || new Set(artifactIds).size !== artifactIds.length) throw new Error('Result requires unique Artifact IDs'); const result = await this.results.createForMember({ id: randomUUID(), taskId, userId: context.currentUser.id, artifactIds, now: new Date() }); if (result === 'NOT_FOUND') throw new ResultNotFoundError(); return result; }
  async get(context: RequestContext, id: string): Promise<ResultContract> { const result = await this.results.getForMember(id, context.currentUser.id); if (result === 'NOT_FOUND') throw new ResultNotFoundError(); return result; }
  async list(context: RequestContext, taskId: string): Promise<ResultContract[]> { const results = await this.results.listForTaskForMember(taskId, context.currentUser.id); if (!results) throw new ResultNotFoundError(); return results; }
  async submit(context: RequestContext, id: string): Promise<ResultContract> { const result = await this.results.submitForReviewForMember(id, context.currentUser.id, new Date()); if (result === 'NOT_FOUND') throw new ResultNotFoundError(); if (result === 'INVALID_STATE') throw new ResultInvalidStateError(); return result; }
}
