import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { DevIdentityProvider } from '../../apps/api/src/identity/dev-identity-provider.js';
import {
  AgentRunRepository,
  createPrismaClient
} from '../../packages/database/src/index.js';

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
    await db.agentToolCall.deleteMany();
    await db.agentRun.deleteMany();
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

  it('creates a running AgentRun and completes its one pending ToolCall idempotently', async () => {
    const app = await createApp({ prisma: requireDatabase() });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    const task = (
      await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/tasks`,
        payload: { title: 'Task' }
      })
    ).json();
    const created = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/agent-runs`,
      payload: { name: 'list_directory', relativePath: '' }
    });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body).toMatchObject({
      run: { status: 'RUNNING', taskId: task.id },
      toolRequest: { name: 'list_directory', projectId: project.id }
    });
    const receipt = {
      toolCallId: body.toolRequest.id,
      status: 'SUCCEEDED',
      metadata: { relativePath: '', entryCount: 2 }
    };
    const completed = await app.inject({
      method: 'POST',
      url: `/agent-runs/${body.run.id}/tool-results`,
      payload: receipt
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ status: 'SUCCEEDED' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/agent-runs/${body.run.id}/tool-results`,
          payload: receipt
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/tasks/${task.id}/agent-runs`,
          payload: { name: 'run_command', relativePath: '' }
        })
      ).statusCode
    ).toBe(400);
    await app.close();
  });

  it('rejects receipts that do not match the original tool request without changing state', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    const task = (
      await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/tasks`,
        payload: { title: 'Task' }
      })
    ).json();
    const created = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'read_file', relativePath: 'brief.md' }
      })
    ).json();
    for (const metadata of [
      {
        relativePath: 'wrong.md',
        size: 1,
        encoding: 'utf-8',
        sha256: 'a'.repeat(64)
      },
      { relativePath: 'brief.md', encoding: 'utf-8', sha256: 'a'.repeat(64) },
      { relativePath: 'brief.md', size: 1, sha256: 'a'.repeat(64) },
      { relativePath: 'brief.md', size: 1, encoding: 'utf-8' },
      { relativePath: 'brief.md', size: 1, encoding: 'utf-8', sha256: 'bad' },
      {
        relativePath: 'brief.md',
        size: 1,
        encoding: 'utf-8',
        sha256: 'a'.repeat(64),
        entryCount: 1
      }
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/agent-runs/${created.run.id}/tool-results`,
            payload: {
              toolCallId: created.toolRequest.id,
              status: 'SUCCEEDED',
              metadata
            }
          })
        ).statusCode
      ).toBe(400);
    await expect(
      db.agentRun.findUniqueOrThrow({ where: { id: created.run.id } })
    ).resolves.toMatchObject({ status: 'RUNNING' });
    await expect(
      db.agentToolCall.findUniqueOrThrow({
        where: { id: created.toolRequest.id }
      })
    ).resolves.toMatchObject({ status: 'PENDING' });
    await app.close();
  });

  it('rejects invalid list receipts, preserves pending state, and persists only intent', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    const task = (
      await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/tasks`,
        payload: { title: 'Task' }
      })
    ).json();
    const created = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'list_directory', relativePath: 'docs' }
      })
    ).json();
    expect(
      (await db.agentRun.findUniqueOrThrow({ where: { id: created.run.id } }))
        .intent
    ).toEqual({ name: 'list_directory', relativePath: 'docs' });
    for (const metadata of [
      { relativePath: 'wrong', entryCount: 0 },
      { relativePath: 'docs', entryCount: 0, size: 1 },
      { relativePath: 'docs', entryCount: 0, encoding: 'utf-8' },
      { relativePath: 'docs', entryCount: 0, sha256: 'a'.repeat(64) }
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/agent-runs/${created.run.id}/tool-results`,
            payload: {
              toolCallId: created.toolRequest.id,
              status: 'SUCCEEDED',
              metadata
            }
          })
        ).statusCode
      ).toBe(400);
    await expect(
      db.agentRun.findUniqueOrThrow({ where: { id: created.run.id } })
    ).resolves.toMatchObject({
      status: 'RUNNING',
      intent: { name: 'list_directory', relativePath: 'docs' }
    });
    await expect(
      db.agentToolCall.findUniqueOrThrow({
        where: { id: created.toolRequest.id }
      })
    ).resolves.toMatchObject({ status: 'PENDING' });
    await app.close();
  });

  it('hides and refuses completion after membership is revoked', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    const task = (
      await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/tasks`,
        payload: { title: 'Task' }
      })
    ).json();
    const created = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'list_directory', relativePath: '' }
      })
    ).json();
    await db.projectMember.delete({
      where: { projectId_userId: { projectId: project.id, userId: 'dev-user' } }
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/agent-runs/${created.run.id}`
        })
      ).statusCode
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/agent-runs/${created.run.id}/tool-results`,
          payload: {
            toolCallId: created.toolRequest.id,
            status: 'SUCCEEDED',
            metadata: { relativePath: '', entryCount: 0 }
          }
        })
      ).statusCode
    ).toBe(404);
    await expect(
      db.agentRun.findUniqueOrThrow({ where: { id: created.run.id } })
    ).resolves.toMatchObject({ status: 'RUNNING' });
    await expect(
      db.agentToolCall.findUniqueOrThrow({
        where: { id: created.toolRequest.id }
      })
    ).resolves.toMatchObject({ status: 'PENDING' });
    await app.close();
  });

  it('handles concurrent identical and conflicting completions without partial state', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    const task = (
      await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/tasks`,
        payload: { title: 'Task' }
      })
    ).json();
    const create = async () =>
      (
        await app.inject({
          method: 'POST',
          url: `/tasks/${task.id}/agent-runs`,
          payload: { name: 'list_directory', relativePath: '' }
        })
      ).json();
    const first = await create();
    const same = {
      toolCallId: first.toolRequest.id,
      status: 'SUCCEEDED',
      metadata: { relativePath: '', entryCount: 0 }
    };
    expect(
      (
        await Promise.all([
          app.inject({
            method: 'POST',
            url: `/agent-runs/${first.run.id}/tool-results`,
            payload: same
          }),
          app.inject({
            method: 'POST',
            url: `/agent-runs/${first.run.id}/tool-results`,
            payload: same
          })
        ])
      ).map((r) => r.statusCode)
    ).toEqual([200, 200]);
    await expect(
      db.agentRun.findUniqueOrThrow({ where: { id: first.run.id } })
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    await expect(
      db.agentToolCall.findUniqueOrThrow({
        where: { id: first.toolRequest.id }
      })
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      receipt: same,
      completedAt: expect.any(Date)
    });
    const second = await create();
    const [a, b] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/agent-runs/${second.run.id}/tool-results`,
        payload: {
          toolCallId: second.toolRequest.id,
          status: 'SUCCEEDED',
          metadata: { relativePath: '', entryCount: 1 }
        }
      }),
      app.inject({
        method: 'POST',
        url: `/agent-runs/${second.run.id}/tool-results`,
        payload: {
          toolCallId: second.toolRequest.id,
          status: 'FAILED',
          error: { code: 'LOCAL_IO_ERROR', message: 'failed', details: {} }
        }
      })
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const winner = a.statusCode === 200 ? a.json() : b.json();
    const persistedRun = await db.agentRun.findUniqueOrThrow({
      where: { id: second.run.id }
    });
    const persistedCall = await db.agentToolCall.findUniqueOrThrow({
      where: { id: second.toolRequest.id }
    });
    expect(persistedRun.status).toBe(winner.status);
    expect(persistedCall.status).toBe(winner.status);
    expect(persistedCall.receipt).toEqual(
      a.statusCode === 200
        ? {
            toolCallId: second.toolRequest.id,
            status: 'SUCCEEDED',
            metadata: { relativePath: '', entryCount: 1 }
          }
        : {
            toolCallId: second.toolRequest.id,
            status: 'FAILED',
            error: { code: 'LOCAL_IO_ERROR', message: 'failed', details: {} }
          }
    );
    await app.close();
  });

  it('rolls back ToolCall completion when AgentRun CAS cannot transition', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Project' }
      })
    ).json();
    const task = (
      await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/tasks`,
        payload: { title: 'Task' }
      })
    ).json();
    const created = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'list_directory', relativePath: '' }
      })
    ).json();
    await db.agentRun.update({
      where: { id: created.run.id },
      data: { status: 'SUCCEEDED' }
    });
    await expect(
      new AgentRunRepository(db).complete(created.run.id, 'dev-user', {
        toolCallId: created.toolRequest.id,
        status: 'SUCCEEDED',
        metadata: { relativePath: '', entryCount: 0 }
      })
    ).resolves.toBe('CONFLICT');
    await expect(
      db.agentToolCall.findUniqueOrThrow({
        where: { id: created.toolRequest.id }
      })
    ).resolves.toMatchObject({
      status: 'PENDING',
      receipt: null,
      completedAt: null
    });
    await app.close();
  });

  it('enforces the AgentRun Task and Project composite foreign key', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const a = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'A' }
      })
    ).json();
    const b = (
      await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'B' }
      })
    ).json();
    const taskB = (
      await app.inject({
        method: 'POST',
        url: `/projects/${b.id}/tasks`,
        payload: { title: 'Task B' }
      })
    ).json();
    await expect(
      db.agentRun.create({
        data: {
          id: 'invalid-composite-run',
          userId: 'dev-user',
          projectId: a.id,
          taskId: taskB.id,
          agentDefinitionKey: 'read-only-work-agent-v1',
          intent: { name: 'list_directory', relativePath: '' },
          status: 'RUNNING',
          createdAt: new Date(),
          startedAt: new Date(),
          updatedAt: new Date()
        }
      })
    ).rejects.toThrow();
    await app.close();
  });
});
