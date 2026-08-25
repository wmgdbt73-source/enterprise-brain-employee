import type { FastifyInstance } from 'fastify';
import { TaskService } from './task-service.js';

const body = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    assigneeId: { type: 'string' },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    deadline: { type: 'string', format: 'date-time' }
  }
} as const;
const projectParams = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } }
} as const;
const taskParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } }
} as const;

export function registerTaskRoutes(
  app: FastifyInstance,
  service: TaskService
): void {
  app.post<{
    Params: { projectId: string };
    Body: {
      title: string;
      description?: string;
      assigneeId?: string;
      priority?: 'P0' | 'P1' | 'P2' | 'P3';
      acceptanceCriteria?: string[];
      deadline?: string;
    };
  }>(
    '/projects/:projectId/tasks',
    { schema: { params: projectParams, body } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await service.create(
            request.requestContext,
            request.params.projectId,
            request.body
          )
        )
  );
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/tasks',
    { schema: { params: projectParams } },
    async (request) => ({
      tasks: await service.list(
        request.requestContext,
        request.params.projectId
      )
    })
  );
  app.get<{ Params: { id: string } }>(
    '/tasks/:id',
    { schema: { params: taskParams } },
    async (request) => service.get(request.requestContext, request.params.id)
  );
  app.post<{ Params: { id: string } }>(
    '/tasks/:id/start',
    { schema: { params: taskParams } },
    async (request) => service.start(request.requestContext, request.params.id)
  );
}
