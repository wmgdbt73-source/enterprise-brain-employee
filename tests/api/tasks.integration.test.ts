import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { DevIdentityProvider } from '../../apps/api/src/identity/dev-identity-provider.js';
import { createPrismaClient } from '../../packages/database/src/index.js';

const connectionString = process.env.DATABASE_URL;
const database = connectionString
  ? createPrismaClient(connectionString)
  : undefined;

function requireDatabase() {
  if (!database)
    throw new Error('DATABASE_URL is required for API integration tests');
  return database;
}

describe('Task API vertical slice', () => {
  beforeEach(async () => {
    const db = requireDatabase();
    await db.taskDependency.deleteMany();
    await db.taskAssignment.deleteMany();
    await db.task.deleteMany();
    await db.projectMember.deleteMany();
    await db.project.deleteMany();
    await db.user.deleteMany();
  });
  afterAll(async () => database?.$disconnect());

  it('creates, lists, reads and starts an unassigned Task persistently', async () => {
    const app = await createApp({ prisma: requireDatabase() });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    const createdResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/tasks`,
      payload: {
        title: 'Prepare requirement document',
        acceptanceCriteria: ['Complete']
      }
    });
    expect(createdResponse.statusCode).toBe(201);
    const task = createdResponse.json();
    expect(task).toMatchObject({
      projectId: project.id,
      status: 'TODO',
      priority: 'P2',
      dependencyIds: []
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/projects/${project.id}/tasks`
        })
      ).json()
    ).toEqual({ tasks: [task] });
    expect(
      (
        await app.inject({ method: 'POST', url: `/tasks/${task.id}/start` })
      ).json()
    ).toMatchObject({ status: 'IN_PROGRESS' });
    expect(
      (await app.inject({ method: 'GET', url: `/tasks/${task.id}` })).json()
    ).toMatchObject({ status: 'IN_PROGRESS' });
    const outsiderApp = await createApp({
      prisma: requireDatabase(),
      identityProvider: new DevIdentityProvider({ id: 'non-member' })
    });
    expect(
      (
        await outsiderApp.inject({
          method: 'GET',
          url: `/projects/${project.id}/tasks`
        })
      ).statusCode
    ).toBe(404);
    expect(
      (await outsiderApp.inject({ method: 'GET', url: `/tasks/${task.id}` }))
        .statusCode
    ).toBe(404);
    await outsiderApp.close();
    const again = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/start`
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({
      error: { code: 'INVALID_STATE_TRANSITION', details: {} }
    });
    expect(
      (await app.inject({ method: 'GET', url: `/tasks/${task.id}` })).json()
    ).toMatchObject({ status: 'IN_PROGRESS' });
    await app.close();
  });

  it('persists TaskAssignment when creating an assigned Task', async () => {
    const app = await createApp({ prisma: requireDatabase() });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/tasks`,
      payload: { title: 'Assigned', assigneeId: 'dev-user' }
    });
    expect(response.statusCode).toBe(201);
    const task = response.json();
    await expect(
      requireDatabase().taskAssignment.findUniqueOrThrow({
        where: { taskId: task.id }
      })
    ).resolves.toMatchObject({
      taskId: task.id,
      projectId: project.id,
      userId: 'dev-user'
    });
    await app.close();
  });

  it('rejects outsider assignment, invalid input, and hidden resources', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    await db.user.create({
      data: {
        id: 'outsider',
        name: 'Outsider',
        systemRole: 'EMPLOYEE',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    for (const payload of [
      { title: 'Task', assigneeId: 'outsider' },
      { title: '   ' },
      {
        title: 'Task',
        status: 'ACCEPTED',
        projectId: 'forged',
        dependencyIds: ['x']
      }
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/tasks`,
        payload
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR', details: {} }
      });
    }
    expect(
      (await app.inject({ method: 'GET', url: '/projects/missing/tasks' }))
        .statusCode
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/tasks/missing' })).statusCode
    ).toBe(404);
    await app.close();
  });
});
