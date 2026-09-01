import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { DevIdentityProvider } from '../../apps/api/src/identity/dev-identity-provider.js';
import type { IdentityProvider } from '../../apps/api/src/identity/identity-provider.js';
import { createPrismaClient } from '../../packages/database/src/index.js';
import {
  asProjectId,
  asProjectMemberId,
  asUserId,
  createProject,
  createUser
} from '../../packages/domain/src/index.js';

const connectionString = process.env.DATABASE_URL;
const database = connectionString
  ? createPrismaClient(connectionString)
  : undefined;

function requireDatabase() {
  if (!database) {
    throw new Error('DATABASE_URL is required for API integration tests');
  }

  return database;
}

describe('Project API vertical slice', () => {
  beforeEach(async () => {
    const db = requireDatabase();
    await db.session.deleteMany();
    await db.account.deleteMany();
    await db.humanConfirmation.deleteMany();
    await db.review.deleteMany();
    await db.resultArtifact.deleteMany();
    await db.result.deleteMany();
    await db.artifact.deleteMany();
    await db.agentToolCall.deleteMany();
    await db.agentRun.deleteMany();
    await db.agentAssignment.deleteMany();
    await db.agentVersion.deleteMany();
    await db.agentDefinition.deleteMany();
    await db.taskDependency.deleteMany();
    await db.taskAssignment.deleteMany();
    await db.task.deleteMany();
    await db.projectMember.deleteMany();
    await db.project.deleteMany();
    await db.departmentMembership.deleteMany();
    await db.permissionOverride.deleteMany();
    await db.organizationMembership.deleteMany();
    await db.department.deleteMany();
    await db.organization.deleteMany();
    await db.user.deleteMany();
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it('creates and reads a current-user project through the database', async () => {
    const app = await createApp({
      prisma: requireDatabase(),
      identityProvider: new DevIdentityProvider()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        name: 'Employee Alpha',
        goal: 'Run core delivery flow'
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).toMatchObject({
      name: 'Employee Alpha',
      goal: 'Run core delivery flow',
      status: 'ACTIVE'
    });

    await expect(
      requireDatabase().projectMember.findFirstOrThrow({
        where: { projectId: created.id, userId: 'dev-user', role: 'OWNER' }
      })
    ).resolves.toBeDefined();

    const listResponse = await app.inject({ method: 'GET', url: '/projects' });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({ projects: [created] });

    const getResponse = await app.inject({
      method: 'GET',
      url: `/projects/${created.id}`
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(created);

    await app.close();
  });

  it('returns the injected RequestContext identity from /me', async () => {
    const identity: IdentityProvider = {
      getCurrentUser: async () => ({
        id: asUserId('alternative-user'),
        name: 'Alternative',
        systemRole: 'ADMIN'
      })
    };
    const app = await createApp({
      prisma: requireDatabase(),
      identityProvider: identity
    });
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'alternative-user',
      name: 'Alternative',
      systemRole: 'ADMIN'
    });
    await app.close();
  });

  it('returns contract-safe validation errors for invalid project creation', async () => {
    const app = await createApp({ prisma: requireDatabase(), identityProvider: new DevIdentityProvider() });

    const blankName = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: '   ' }
    });
    expect(blankName.statusCode).toBe(400);
    expect(blankName.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: {} }
    });

    const forbiddenFields = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Valid', ownerId: 'attacker', status: 'ARCHIVED' }
    });
    expect(forbiddenFields.statusCode).toBe(400);
    expect(forbiddenFields.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: {} }
    });

    await app.close();
  });

  it('returns the same 404 for unknown and non-member projects', async () => {
    const db = requireDatabase();
    const now = new Date('2026-08-25T00:00:00.000Z');
    const outsider = createUser(
      { id: asUserId('outsider'), name: 'Outsider', systemRole: 'EMPLOYEE' },
      now
    );
    await db.user.create({
      data: {
        id: outsider.id,
        name: outsider.name,
        systemRole: outsider.systemRole,
        createdAt: outsider.createdAt,
        updatedAt: outsider.updatedAt
      }
    });
    const foreignProject = createProject(
      {
        id: asProjectId('foreign-project'),
        name: 'Foreign',
        initialOwner: {
          memberId: asProjectMemberId('foreign-owner-membership'),
          userId: outsider.id
        }
      },
      now
    );
    await db.$transaction(async (transaction) => {
      await transaction.project.create({
        data: {
          id: foreignProject.project.id,
          name: foreignProject.project.name,
          status: foreignProject.project.status,
          createdAt: foreignProject.project.createdAt,
          updatedAt: foreignProject.project.updatedAt
        }
      });
      await transaction.projectMember.create({
        data: {
          id: foreignProject.initialMember.id,
          projectId: foreignProject.initialMember.projectId,
          userId: foreignProject.initialMember.userId,
          role: foreignProject.initialMember.role,
          createdAt: foreignProject.initialMember.createdAt,
          updatedAt: foreignProject.initialMember.updatedAt
        }
      });
    });

    const app = await createApp({ prisma: db, identityProvider: new DevIdentityProvider() });
    for (const projectId of ['missing-project', 'foreign-project']) {
      const response = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}`
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
          details: {}
        }
      });
    }

    await app.close();
  });
});
