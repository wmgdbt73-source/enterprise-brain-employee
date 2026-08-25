import Fastify, { type FastifyInstance } from 'fastify';
import { createUser, type User } from '@enterprise-brain/domain';
import {
  ProjectRepository,
  TaskRepository,
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
  registerProjectRoutes(app, new ProjectService(new ProjectRepository(prisma)));
  registerTaskRoutes(app, new TaskService(new TaskRepository(prisma)));

  app.setErrorHandler((error, _request, reply) => {
    if (isDomainError(error) && error.code === 'INVALID_STATE_TRANSITION') {
      return reply
        .code(409)
        .send({
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
      error instanceof TaskNotFoundError
    ) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
          details: {}
        }
      });
    }

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
