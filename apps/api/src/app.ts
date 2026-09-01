import Fastify, { type FastifyInstance } from 'fastify';
import { asUserId, createUser, type User } from '@enterprise-brain/domain';
import type { CurrentUserContract } from '@enterprise-brain/contracts';
import {
  ProjectRepository,
  TaskRepository,
  AgentRunRepository,
  ArtifactRepository,
  ResultRepository,
  HumanConfirmationRepository,
  OrganizationRepository,
  PermissionRepository,
  createPrismaClient,
  ensureUser,
  SessionRepository,
  type PrismaClient
} from '@enterprise-brain/database';
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
  TaskDependencyBlockedError,
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
import { InvalidCredentialsError, registerAuthRoutes } from './modules/auth/auth-routes.js';
import { registerOrganizationRoutes } from './modules/organization/organization-routes.js';
import { OrganizationForbiddenError, OrganizationNotFoundError, OrganizationService } from './modules/organization/organization-service.js';
import { registerPermissionRoutes } from './modules/permissions/permission-routes.js';
import { PermissionForbiddenError, PermissionNotFoundError, PermissionService, PermissionValidationError } from './modules/permissions/permission-service.js';

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
  const prisma =
    options.prisma ??
    createPrismaClient(requireDatabaseUrl(process.env.DATABASE_URL));
  const identityProvider = options.identityProvider;
  const sessions = new SessionRepository(prisma);
  // Injected identity is a test seam only. Production defaults to SessionRepository.
  if (identityProvider) await ensureUser(prisma, toDomainUser(await identityProvider.getCurrentUser()));

  app.addHook('onRequest', async (request) => {
    const currentUser = identityProvider
      ? await identityProvider.getCurrentUser()
      : await sessions.resolveBearer(request.headers.authorization);
    request.requestContext = currentUser ? { currentUser: { ...currentUser, id: asUserId(currentUser.id) } } : ({} as typeof request.requestContext);
  });
  app.addHook('preHandler', async (request) => {
    if (request.url === '/health' || request.url === '/auth/login') return;
    if (!request.requestContext.currentUser) throw new AuthenticationRequiredError();
  });

  app.get('/health', async () => ({ status: 'ok' }));
  registerAuthRoutes(app, sessions);
  app.get('/me', async (request): Promise<CurrentUserContract> => ({
    id: request.requestContext.currentUser.id,
    name: request.requestContext.currentUser.name,
    systemRole: request.requestContext.currentUser.systemRole,
    organization: request.requestContext.currentUser.organization,
    department: request.requestContext.currentUser.department
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
  registerOrganizationRoutes(app, new OrganizationService(new OrganizationRepository(prisma)));
  registerPermissionRoutes(app, new PermissionService(new PermissionRepository(prisma)));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthenticationRequiredError || error instanceof InvalidCredentialsError) {
      return reply.code(401).send({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required', details: {} } });
    }
    if (isDomainError(error) && error.code === 'INVALID_STATE_TRANSITION') {
      return reply.code(409).send({
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: error.message,
          details: {}
        }
      });
    }
    if (hasValidationError(error) || isDomainError(error) || error instanceof PermissionValidationError) {
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
      || error instanceof OrganizationNotFoundError
      || error instanceof PermissionNotFoundError
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
    if (error instanceof TaskDependencyBlockedError)
      return reply.code(409).send({ error: { code: 'TASK_DEPENDENCY_BLOCKED', message: 'Task dependencies are not accepted', details: { blockingDependencyIds: error.blockingDependencyIds } } });
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
    if (error instanceof OrganizationForbiddenError) return reply.code(403).send({ error: { code: 'PERMISSION_DENIED', message: 'Current user cannot manage this organization resource', details: {} } });
    if (error instanceof PermissionForbiddenError) return reply.code(403).send({ error: { code: 'PERMISSION_DENIED', message: 'Current user cannot manage permission overrides', details: {} } });
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

export class AuthenticationRequiredError extends Error {}

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
  id: User['id']; name: string; systemRole: User['systemRole'];
}): User {
  return createUser({ id: currentUser.id, name: currentUser.name, systemRole: currentUser.systemRole }, new Date());
}
