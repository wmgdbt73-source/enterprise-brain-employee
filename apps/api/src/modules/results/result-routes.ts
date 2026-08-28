import type { FastifyInstance } from 'fastify';
import { ResultService } from './result-service.js';

const resultParams = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', minLength: 1 } } } as const;
const taskParams = { type: 'object', additionalProperties: false, required: ['taskId'], properties: { taskId: { type: 'string', minLength: 1 } } } as const;
const createBody = { type: 'object', additionalProperties: false, required: ['artifactIds'], properties: { artifactIds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } } } } as const;
const idempotencyHeaders = { type: 'object', additionalProperties: true, required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } } } as const;

export function registerResultRoutes(app: FastifyInstance, service: ResultService): void {
  app.post<{ Params: { taskId: string }; Body: { artifactIds: string[] }; Headers: { 'idempotency-key': string } }>(
    '/tasks/:taskId/results',
    { schema: { params: taskParams, body: createBody, headers: idempotencyHeaders } },
    async (request, reply) => {
      const created = await service.create(request.requestContext, request.params.taskId, request.body.artifactIds, request.headers['idempotency-key']);
      return reply.code(created.created ? 201 : 200).send(created.result);
    }
  );
  app.get<{ Params: { id: string } }>('/results/:id', { schema: { params: resultParams } }, async (request) =>
    service.get(request.requestContext, request.params.id)
  );
}
