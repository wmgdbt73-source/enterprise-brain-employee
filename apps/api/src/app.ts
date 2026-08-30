import Fastify, { type FastifyInstance } from 'fastify';
import { createUser, type User } from '@enterprise-brain/domain';
import type { CurrentUserContract } from '@enterprise-brain/contracts';
import {
  ProjectRepository,
  TaskRepository,
  AgentRunRepository,
  ArtifactRepository,
  ResultRepository,
  HumanConfirmationRepository,
  createPrismaClient,
  ensureUser,
  type PrismaClient
} from '@enterprise-brain/database';
import { DevIdentityProvider } from './identity/dev-identity-provider.js';
import type { IdentityProvider } from './identity/identity-provider.js';
import { registerProjectRoutes } from './modules/projects/project-routes.js';
import {
  isDomainError,
  ProjectNotFoundError,
  ProjectService
} from './modules/projects/project-service.js';
import { registerTaskRoutes } from './modules/tasks/task-routes.js';
import {
  TaskNotFoundError,
  TaskService
} from './modules/tasks/task-service.js';
import { registerAgentRunRoutes } from './modules/agent-runs/agent-run-routes.js';
import {
  AgentRunConflictError,
  AgentRunInvalidResultError,
  HumanConfirmationRequiredError,
  AgentRunNotFoundError,
  AgentRunService
} from './modules/agent-runs/agent-run-service.js';
import { registerArtifactRoutes } from './modules/artifacts/artifact-routes.js';
import {
  ArtifactNotFoundError,
  ArtifactService,
  ArtifactSourceInvalidError
} from './modules/artifacts/artifact-service.js';
import { registerHumanConfirmationRoutes } from './modules/human-confirmations/human-confirmation-routes.js';
import { HumanConfirmationConflictError, HumanConfirmationNotFoundError, HumanConfirmationService } from './modules/human-confirmations/human-confirmation-service.js';
import { registerResultRoutes } from './modules/results/result-routes.js';
import { ResultIdempotencyConflictError, ResultNotFoundError, ResultReviewConflictError, ResultReviewForbiddenError, ResultService, ResultStateConflictError } from './modules/results/result-service.js';

export interface CreateAppOptions {
  prisma?: PrismaClient;
  identityProvider?: IdentityProvider;
}

export async function createApp(
  options: CreateAppOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    ajv: {
      customOptions: {
        removeAdditional: false
      }
    }
  });
  const identityProvider =
    options.identityProvider ?? new DevIdentityProvider();
  const prisma =
    options.prisma ??
    createPrismaClient(requireDatabaseUrl(process.env.DATABASE_URL));
  const currentUser = await identityProvider.getCurrentUser();

  await ensureUser(prisma, toDomainUser(currentUser));

  app.addHook('onRequest', async (request) => {
    request.requestContext = {
      currentUser: await identityProvider.getCurrentUser()
    };
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/me', async (request): Promise<CurrentUserContract> => ({
    id: request.requestContext.currentUser.id,
    name: request.requestContext.currentUser.name,
    systemRole: request.requestContext.currentUser.systemRole
  }));
  registerProjectRoutes(app, new ProjectService(new ProjectRepository(prisma)));
  registerTaskRoutes(app, new TaskService(new TaskRepository(prisma)));
  registerAgentRunRoutes(
    app,
    new AgentRunService(
      new AgentRunRepository(prisma),
      new TaskRepository(prisma)
    )
  );
  registerArtifactRoutes(
    app,
    new ArtifactService(new ArtifactRepository(prisma))
  );
  registerHumanConfirmationRoutes(app, new HumanConfirmationService(new HumanConfirmationRepository(prisma)));
  registerResultRoutes(app, new ResultService(new ResultRepository(prisma)));

  app.setErrorHandler((error, _request, reply) => {
    if (isDomainError(error) && error.code === 'INVALID_STATE_TRANSITION') {
      return reply.code(409).send({
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: error.message,
          details: {}
        }
      });
    }
    if (hasValidationError(error) || isDomainError(error)) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: toErrorMessage(error),
          details: {}
        }
      });
    }

    if (
      error instanceof ProjectNotFoundError ||
      error instanceof TaskNotFoundError ||
      error instanceof AgentRunNotFoundError ||
      error instanceof ArtifactNotFoundError
      || error instanceof ResultNotFoundError
      || error instanceof HumanConfirmationNotFoundError
    ) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
          details: {}
        }
      });
    }
    if (error instanceof AgentRunConflictError)
      return reply.code(409).send({
        error: {
          code: 'AGENT_RUN_CONFLICT',
          message: 'Conflicting AgentRun completion',
          details: {}
        }
      });
    if (error instanceof AgentRunInvalidResultError)
      return reply.code(400).send({
        error: {
          code: 'AGENT_TOOL_RESULT_INVALID',
          message: 'Tool completion does not match request',
          details: {}
        }
      });
    if (error instanceof HumanConfirmationRequiredError) return reply.code(409).send({ error: { code: 'HUMAN_CONFIRMATION_REQUIRED', message: 'Approved human confirmation is required', details: {} } });
    if (error instanceof ArtifactSourceInvalidError)
      return reply.code(409).send({
        error: {
          code: 'ARTIFACT_SOURCE_INVALID',
          message: 'AgentRun source is not eligible for Artifact registration',
          details: {}
        }
      });
    if (error instanceof HumanConfirmationConflictError) return reply.code(409).send({ error: { code: 'HUMAN_CONFIRMATION_CONFLICT', message: 'Conflicting confirmation decision', details: {} } });
    if (error instanceof ResultIdempotencyConflictError) return reply.code(409).send({ error: { code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'Idempotency key was previously used for a different Result Candidate request', details: {} } });
    if (error instanceof ResultReviewForbiddenError) return reply.code(403).send({ error: { code: 'PERMISSION_DENIED', message: 'Current user cannot perform this human review action', details: {} } });
    if (error instanceof ResultStateConflictError) return reply.code(409).send({ error: { code: 'INVALID_STATE_TRANSITION', message: 'Result is not in the required state', details: {} } });
    if (error instanceof ResultReviewConflictError) return reply.code(409).send({ error: { code: 'REVIEW_CONFLICT', message: 'A different human review decision already exists', details: {} } });

    app.log.error(error);
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: {}
      }
    });
  });

  return app;
}

function requireDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('DATABASE_URL is required to create the API application');
  }

  return value;
}

function hasValidationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Validation failed';
}

function toDomainUser(currentUser: {
  id: User['id'];
  name: string;
  systemRole: User['systemRole'];
}): User {
  return createUser(
    {
      id: currentUser.id,
      name: currentUser.name,
      systemRole: currentUser.systemRole
    },
    new Date()
  );
}
