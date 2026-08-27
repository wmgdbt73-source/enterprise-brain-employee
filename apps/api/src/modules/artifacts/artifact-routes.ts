import type { FastifyInstance } from 'fastify';
import { ArtifactService } from './artifact-service.js';

const agentRunIdBody = {
  type: 'object',
  additionalProperties: false,
  required: ['agentRunId'],
  properties: { agentRunId: { type: 'string', minLength: 1 } }
} as const;
const taskParams = {
  type: 'object',
  additionalProperties: false,
  required: ['taskId'],
  properties: { taskId: { type: 'string', minLength: 1 } }
} as const;

export function registerArtifactRoutes(
  app: FastifyInstance,
  service: ArtifactService
): void {
  app.post<{ Body: { agentRunId: string } }>(
    '/artifacts',
    { schema: { body: agentRunIdBody } },
    async (request, reply) => {
      const result = await service.register(
        request.requestContext,
        request.body.agentRunId
      );
      return reply.code(result.created ? 201 : 200).send(result.artifact);
    }
  );
  app.get<{ Params: { taskId: string } }>(
    '/tasks/:taskId/artifacts',
    { schema: { params: taskParams } },
    async (request) => ({
      artifacts: await service.list(
        request.requestContext,
        request.params.taskId
      )
    })
  );
}
