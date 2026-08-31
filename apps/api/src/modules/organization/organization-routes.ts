import type { FastifyInstance } from 'fastify';
import { OrganizationService } from './organization-service.js';
const id = { type: 'string', minLength: 1 } as const;
const departmentBody = { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 200 } } } as const;
const departmentPatch = { type: 'object', additionalProperties: false, minProperties: 1, properties: { name: { type: 'string', minLength: 1, maxLength: 200 }, status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] } } } as const;
const assignBody = { type: 'object', additionalProperties: false, required: ['departmentId', 'role'], properties: { departmentId: id, role: { type: 'string', enum: ['MANAGER', 'MEMBER'] } } } as const;
export function registerOrganizationRoutes(app: FastifyInstance, service: OrganizationService): void {
  app.get('/organization', async (request) => service.get(request.requestContext));
  app.get('/departments', async (request) => ({ departments: await service.list(request.requestContext) }));
  app.post<{ Body: { name: string } }>('/departments', { schema: { body: departmentBody } }, async (request, reply) => reply.code(201).send(await service.create(request.requestContext, request.body.name)));
  app.patch<{ Params: { id: string }; Body: { name?: string; status?: 'ACTIVE' | 'DISABLED' } }>('/departments/:id', { schema: { params: { type: 'object', additionalProperties: false, required: ['id'], properties: { id } }, body: departmentPatch } }, async (request) => service.update(request.requestContext, request.params.id, request.body));
  app.get<{ Params: { id: string } }>('/departments/:id/members', { schema: { params: { type: 'object', additionalProperties: false, required: ['id'], properties: { id } } } }, async (request) => ({ members: await service.members(request.requestContext, request.params.id) }));
  app.put<{ Params: { userId: string }; Body: { departmentId: string; role: 'MANAGER' | 'MEMBER' } }>('/employees/:userId/department', { schema: { params: { type: 'object', additionalProperties: false, required: ['userId'], properties: { userId: id } }, body: assignBody } }, async (request) => service.assign(request.requestContext, request.params.userId, request.body.departmentId, request.body.role));
}
