import type { FastifyInstance } from 'fastify';
import { AgentRunService } from './agent-run-service.js';

const intent = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'relativePath'],
      properties: {
        name: { const: 'list_directory' },
        relativePath: { type: 'string' }
      }
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'relativePath'],
      properties: {
        name: { const: 'read_file' },
        relativePath: { type: 'string', minLength: 1 }
      }
    }
  ]
} as const;
const taskParams = {
  type: 'object',
  additionalProperties: false,
  required: ['taskId'],
  properties: { taskId: { type: 'string', minLength: 1 } }
} as const;
const runParams = {
  type: 'object',
  additionalProperties: false,
  required: ['runId'],
  properties: { runId: { type: 'string', minLength: 1 } }
} as const;
const receipt = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['toolCallId', 'status', 'metadata'],
      properties: {
        toolCallId: { type: 'string', minLength: 1 },
        status: { const: 'SUCCEEDED' },
        metadata: {
          type: 'object',
          additionalProperties: false,
          required: ['relativePath'],
          properties: {
            relativePath: { type: 'string' },
            entryCount: { type: 'integer', minimum: 0 },
            size: { type: 'integer', minimum: 0 },
            encoding: { const: 'utf-8' },
            sha256: { type: 'string' }
          }
        }
      }
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['toolCallId', 'status', 'error'],
      properties: {
        toolCallId: { type: 'string', minLength: 1 },
        status: { const: 'FAILED' },
        error: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'message', 'details'],
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object', maxProperties: 0 }
          }
        }
      }
    }
  ]
} as const;
export function registerAgentRunRoutes(
  app: FastifyInstance,
  service: AgentRunService
): void {
  app.post<{
    Params: { taskId: string };
    Body: { name: 'list_directory' | 'read_file'; relativePath: string };
  }>(
    '/tasks/:taskId/agent-runs',
    { schema: { params: taskParams, body: intent } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await service.create(
            request.requestContext,
            request.params.taskId,
            request.body
          )
        )
  );
  app.post<{ Params: { runId: string }; Body: never }>(
    '/agent-runs/:runId/tool-results',
    { schema: { params: runParams, body: receipt } },
    async (request) =>
      service.complete(
        request.requestContext,
        request.params.runId,
        request.body as never
      )
  );
  app.get<{ Params: { runId: string } }>(
    '/agent-runs/:runId',
    { schema: { params: runParams } },
    async (request) => service.get(request.requestContext, request.params.runId)
  );
}
