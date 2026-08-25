import type { FastifyInstance } from 'fastify';
import type { RequestContext } from '../../context/request-context.js';
import { ProjectService } from './project-service.js';

const projectBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string' },
    goal: { type: 'string' }
  }
} as const;

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 }
  }
} as const;

export function registerProjectRoutes(
  app: FastifyInstance,
  service: ProjectService
): void {
  app.post<{ Body: { name: string; goal?: string } }>(
    '/projects',
    { schema: { body: projectBodySchema } },
    async (request, reply) => {
      const project = await service.create(
        request.requestContext,
        request.body
      );
      return reply.code(201).send(project);
    }
  );

  app.get('/projects', async (request) => ({
    projects: await service.list(request.requestContext)
  }));

  app.get<{ Params: { id: string } }>(
    '/projects/:id',
    { schema: { params: projectParamsSchema } },
    async (request) =>
      service.getById(request.requestContext, request.params.id)
  );
}

declare module 'fastify' {
  interface FastifyRequest {
    requestContext: RequestContext;
  }
}
