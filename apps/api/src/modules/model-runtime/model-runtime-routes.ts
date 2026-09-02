import type { FastifyInstance } from 'fastify';
import { ModelRuntimeService } from './model-runtime-service.js';

const params = { type: 'object', additionalProperties: false, required: ['taskId'], properties: { taskId: { type: 'string', minLength: 1 } } } as const;
const headers = { type: 'object', required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 1 } } } as const;
const body = { type: 'object', additionalProperties: false, required: ['agentId', 'prompt'], properties: { agentId: { type: 'string', minLength: 1 }, prompt: { type: 'string', minLength: 1, maxLength: 8000 } } } as const;
const query = { type: 'object', additionalProperties: false, properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } } } as const;

export function registerModelRuntimeRoutes(app: FastifyInstance, service: ModelRuntimeService): void {
  app.post<{ Params: { taskId: string }; Headers: { 'idempotency-key': string }; Body: { agentId: string; prompt: string } }>('/tasks/:taskId/agent-responses', { schema: { params, headers, body } }, async (request, reply) => {
    const value = await service.create(request.requestContext, request.params.taskId, request.body, request.headers['idempotency-key']);
    return reply.code(value.created ? 201 : value.running ? 202 : 200).send({ invocation: value.invocation });
  });
  app.get<{ Params: { taskId: string }; Querystring: { limit?: number } }>('/tasks/:taskId/agent-responses', { schema: { params, querystring: query } }, async request => ({ items: await service.list(request.requestContext, request.params.taskId, request.query.limit) }));
}
