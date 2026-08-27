import type { FastifyInstance } from 'fastify';
import { HumanConfirmationService } from './human-confirmation-service.js';
const params = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', minLength: 1 } } } as const;
export function registerHumanConfirmationRoutes(app: FastifyInstance, service: HumanConfirmationService) {
  app.get<{ Params: { id: string } }>('/human-confirmations/:id', { schema: { params } }, request => service.get(request.requestContext, request.params.id));
  app.post<{ Params: { id: string } }>('/human-confirmations/:id/approve', { schema: { params } }, request => service.decide(request.requestContext, request.params.id, 'APPROVE'));
  app.post<{ Params: { id: string } }>('/human-confirmations/:id/reject', { schema: { params } }, request => service.decide(request.requestContext, request.params.id, 'REJECT'));
}
