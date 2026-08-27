import type { HumanConfirmationRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';
export class HumanConfirmationNotFoundError extends Error {}
export class HumanConfirmationConflictError extends Error {}
export class HumanConfirmationService {
  constructor(private readonly confirmations: HumanConfirmationRepository) {}
  async decide(context: RequestContext, id: string, decision: 'APPROVE' | 'REJECT') {
    const result = await this.confirmations.decide(id, context.currentUser.id, decision);
    if (result === 'NOT_FOUND') throw new HumanConfirmationNotFoundError();
    if (result === 'CONFLICT') throw new HumanConfirmationConflictError();
    return { confirmation: result.confirmation };
  }
  async get(context: RequestContext, id: string) { const result = await this.confirmations.findForUser(id, context.currentUser.id); if (!result) throw new HumanConfirmationNotFoundError(); return { confirmation: result }; }
}
