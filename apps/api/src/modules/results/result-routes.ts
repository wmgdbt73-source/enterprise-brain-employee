import type { FastifyInstance } from 'fastify';
import { ResultService } from './result-service.js';
const artifactBody = { type: 'object', additionalProperties: false, required: ['artifactIds'], properties: { artifactIds: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } } } as const;
const taskParams = { type: 'object', additionalProperties: false, required: ['taskId'], properties: { taskId: { type: 'string', minLength: 1 } } } as const;
const resultParams = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', minLength: 1 } } } as const;
export function registerResultRoutes(app: FastifyInstance, service: ResultService): void {
  app.post<{ Params: { taskId: string }; Body: { artifactIds: string[] } }>('/tasks/:taskId/results', { schema: { params: taskParams, body: artifactBody } }, async (request, reply) => reply.code(201).send(await service.create(request.requestContext, request.params.taskId, request.body.artifactIds)));
  app.get<{ Params: { taskId: string } }>('/tasks/:taskId/results', { schema: { params: taskParams } }, async request => ({ results: await service.list(request.requestContext, request.params.taskId) }));
  app.get<{ Params: { id: string } }>('/results/:id', { schema: { params: resultParams } }, async request => service.get(request.requestContext, request.params.id));
  app.post<{ Params: { id: string } }>('/results/:id/submit-review', { schema: { params: resultParams } }, async request => service.submit(request.requestContext, request.params.id));
}
