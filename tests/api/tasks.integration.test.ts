import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { DevIdentityProvider } from '../../apps/api/src/identity/dev-identity-provider.js';
import {
  AgentRunRepository,
  ArtifactRepository,
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
    await db.resultArtifact.deleteMany();
    await db.result.deleteMany();
    await db.humanConfirmation.deleteMany();
    await db.artifact.deleteMany();
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

  it('registers a receipt-derived Artifact idempotently without changing Task or Run state', async () => {
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
        payload: { name: 'read_file', relativePath: 'docs/brief.md' }
      })
    ).json();
    const receipt = {
      toolCallId: created.toolRequest.id,
      status: 'SUCCEEDED',
      metadata: {
        relativePath: 'docs/brief.md',
        size: 12,
        encoding: 'utf-8',
        sha256: 'a'.repeat(64)
      }
    };
    await app.inject({
      method: 'POST',
      url: `/agent-runs/${created.run.id}/tool-results`,
      payload: receipt
    });
    const first = await app.inject({
      method: 'POST',
      url: '/artifacts',
      payload: { agentRunId: created.run.id }
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      projectId: project.id,
      taskId: task.id,
      agentRunId: created.run.id,
      sourceToolCallId: created.toolRequest.id,
      relativePath: 'docs/brief.md',
      size: 12,
      encoding: 'utf-8',
      sha256: 'a'.repeat(64),
      version: 1,
      createdByUserId: 'dev-user'
    });
    expect(JSON.stringify(first.json())).not.toContain('/Users/');
    expect(JSON.stringify(first.json())).not.toContain('content');
    const second = await app.inject({
      method: 'POST',
      url: '/artifacts',
      payload: { agentRunId: created.run.id }
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(await db.artifact.count()).toBe(1);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status
    ).toBe('TODO');
    expect(
      (await db.agentRun.findUniqueOrThrow({ where: { id: created.run.id } }))
        .status
    ).toBe('SUCCEEDED');
    expect(
      (
        await app.inject({ method: 'GET', url: `/tasks/${task.id}/artifacts` })
      ).json()
    ).toEqual({ artifacts: [first.json()] });
    await app.close();
  });

  it('preserves the receipt relativePath exactly when registering an Artifact', async () => {
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
    const relativePath = ' docs/brief.md ';
    const run = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'read_file', relativePath }
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agent-runs/${run.run.id}/tool-results`,
      payload: {
        toolCallId: run.toolRequest.id,
        status: 'SUCCEEDED',
        metadata: {
          relativePath,
          size: 1,
          encoding: 'utf-8',
          sha256: 'f'.repeat(64)
        }
      }
    });
    const registered = await app.inject({
      method: 'POST',
      url: '/artifacts',
      payload: { agentRunId: run.run.id }
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json().relativePath).toBe(relativePath);
    expect(
      (
        await db.artifact.findUniqueOrThrow({
          where: { id: registered.json().id }
        })
      ).relativePath
    ).toBe(relativePath);
    await app.close();
  });

  it('rejects forged, ineligible, and hidden Artifact sources', async () => {
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
    const list = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'list_directory', relativePath: '' }
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agent-runs/${list.run.id}/tool-results`,
      payload: {
        toolCallId: list.toolRequest.id,
        status: 'SUCCEEDED',
        metadata: { relativePath: '', entryCount: 0 }
      }
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/artifacts',
          payload: { agentRunId: list.run.id }
        })
      ).statusCode
    ).toBe(409);
    const running = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'read_file', relativePath: 'x.md' }
      })
    ).json();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/artifacts',
          payload: { agentRunId: running.run.id }
        })
      ).statusCode
    ).toBe(409);
    await app.inject({
      method: 'POST',
      url: `/agent-runs/${running.run.id}/tool-results`,
      payload: {
        toolCallId: running.toolRequest.id,
        status: 'FAILED',
        error: { code: 'LOCAL_IO_ERROR', message: 'failed', details: {} }
      }
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/artifacts',
          payload: { agentRunId: running.run.id }
        })
      ).statusCode
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/artifacts',
          payload: {
            agentRunId: running.run.id,
            relativePath: '/private',
            content: 'forged'
          }
        })
      ).statusCode
    ).toBe(400);
    const outsider = await createApp({
      prisma: db,
      identityProvider: new DevIdentityProvider({ id: 'outsider' })
    });
    expect(
      (
        await outsider.inject({
          method: 'POST',
          url: '/artifacts',
          payload: { agentRunId: running.run.id }
        })
      ).statusCode
    ).toBe(404);
    expect(
      (
        await outsider.inject({
          method: 'GET',
          url: `/tasks/${task.id}/artifacts`
        })
      ).statusCode
    ).toBe(404);
    await outsider.close();
    await app.close();
  });

  it('serializes concurrent Artifact registration to one durable row', async () => {
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
    const run = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'read_file', relativePath: 'a.md' }
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agent-runs/${run.run.id}/tool-results`,
      payload: {
        toolCallId: run.toolRequest.id,
        status: 'SUCCEEDED',
        metadata: {
          relativePath: 'a.md',
          size: 1,
          encoding: 'utf-8',
          sha256: 'b'.repeat(64)
        }
      }
    });
    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/artifacts',
        payload: { agentRunId: run.run.id }
      }),
      app.inject({
        method: 'POST',
        url: '/artifacts',
        payload: { agentRunId: run.run.id }
      })
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 201
    ]);
    expect(responses[0].json().id).toBe(responses[1].json().id);
    expect(await db.artifact.count()).toBe(1);
    await app.close();
  });

  it('requires exactly one sequence-one ToolCall before Artifact registration', async () => {
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
    const run = (
      await app.inject({
        method: 'POST',
        url: `/tasks/${task.id}/agent-runs`,
        payload: { name: 'read_file', relativePath: 'a.md' }
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agent-runs/${run.run.id}/tool-results`,
      payload: {
        toolCallId: run.toolRequest.id,
        status: 'SUCCEEDED',
        metadata: {
          relativePath: 'a.md',
          size: 1,
          encoding: 'utf-8',
          sha256: 'c'.repeat(64)
        }
      }
    });
    await db.agentToolCall.create({
      data: {
        id: 'unexpected-second-call',
        agentRunId: run.run.id,
        sequence: 2,
        name: 'read_file',
        request: { name: 'read_file', relativePath: 'b.md' },
        status: 'SUCCEEDED',
        receipt: { status: 'SUCCEEDED' },
        createdAt: new Date(),
        completedAt: new Date()
      }
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/artifacts',
          payload: { agentRunId: run.run.id }
        })
      ).statusCode
    ).toBe(409);
    await app.close();
  });

  it('rejects a ToolCall name that disagrees with its persisted read_file request', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const run = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'read_file', relativePath: 'a.md' } })).json();
    await app.inject({ method: 'POST', url: `/agent-runs/${run.run.id}/tool-results`, payload: { toolCallId: run.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath: 'a.md', size: 1, encoding: 'utf-8', sha256: 'f'.repeat(64) } } });
    await db.agentToolCall.update({ where: { id: run.toolRequest.id }, data: { name: 'list_directory' } });
    const response = await app.inject({ method: 'POST', url: '/artifacts', payload: { agentRunId: run.run.id } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'ARTIFACT_SOURCE_INVALID' } });
    await app.close();
  });

  it('rejects Artifact registration when persisted request provenance or path is unsafe', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const complete = async (relativePath: string) => {
      const created = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'read_file', relativePath } })).json();
      await app.inject({ method: 'POST', url: `/agent-runs/${created.run.id}/tool-results`, payload: { toolCallId: created.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath, size: 1, encoding: 'utf-8', sha256: 'a'.repeat(64) } } });
      return created;
    };
    const provenance = await complete('safe.md');
    await db.agentToolCall.update({ where: { id: provenance.toolRequest.id }, data: { request: { ...provenance.toolRequest, userId: 'forged-user' } } });
    expect((await app.inject({ method: 'POST', url: '/artifacts', payload: { agentRunId: provenance.run.id } })).statusCode).toBe(409);
    const unsafe = await complete('safe-two.md');
    await db.agentToolCall.update({ where: { id: unsafe.toolRequest.id }, data: {
      request: { ...unsafe.toolRequest, relativePath: 'docs/../secret.md' },
      receipt: { toolCallId: unsafe.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath: 'docs/../secret.md', size: 1, encoding: 'utf-8', sha256: 'a'.repeat(64) } }
    } });
    expect((await app.inject({ method: 'POST', url: '/artifacts', payload: { agentRunId: unsafe.run.id } })).statusCode).toBe(409);
    expect(await db.artifact.count()).toBe(0);
    await app.close();
  });

  it('hides Artifact registration after membership revocation and from another member', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const run = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'read_file', relativePath: 'a.md' } })).json();
    await app.inject({ method: 'POST', url: `/agent-runs/${run.run.id}/tool-results`, payload: { toolCallId: run.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath: 'a.md', size: 1, encoding: 'utf-8', sha256: 'a'.repeat(64) } } });
    const other = await createApp({ prisma: db, identityProvider: new DevIdentityProvider({ id: 'other-member' }) });
    await db.projectMember.create({ data: { id: 'other-member-project', projectId: project.id, userId: 'other-member', role: 'MEMBER', createdAt: new Date(), updatedAt: new Date() } });
    expect((await other.inject({ method: 'POST', url: '/artifacts', payload: { agentRunId: run.run.id } })).statusCode).toBe(404);
    await db.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: 'dev-user' } } });
    expect((await app.inject({ method: 'POST', url: '/artifacts', payload: { agentRunId: run.run.id } })).statusCode).toBe(404);
    await other.close();
    await app.close();
  });

  it('does not swallow unrelated Artifact uniqueness failures as idempotency', async () => {
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
    const completedRun = async (relativePath: string, sha256: string) => {
      const run = (
        await app.inject({
          method: 'POST',
          url: `/tasks/${task.id}/agent-runs`,
          payload: { name: 'read_file', relativePath }
        })
      ).json();
      await app.inject({
        method: 'POST',
        url: `/agent-runs/${run.run.id}/tool-results`,
        payload: {
          toolCallId: run.toolRequest.id,
          status: 'SUCCEEDED',
          metadata: {
            relativePath,
            size: 1,
            encoding: 'utf-8',
            sha256
          }
        }
      });
      return run;
    };
    const firstRun = await completedRun('a.md', 'd'.repeat(64));
    const first = (
      await app.inject({
        method: 'POST',
        url: '/artifacts',
        payload: { agentRunId: firstRun.run.id }
      })
    ).json();
    const secondRun = await completedRun('b.md', 'e'.repeat(64));
    await expect(
      new ArtifactRepository(db).registerFromRunForUser({
        artifactId: first.id,
        agentRunId: secondRun.run.id,
        userId: 'dev-user',
        now: new Date()
      })
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.artifact.count()).toBe(1);
    await app.close();
  });

  it('creates, confirms, rejects, and completes device-scoped write runs', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const input = { name: 'write_file', relativePath: 'docs/你好.md', payloadSize: 10, payloadSha256: 'a'.repeat(64), effect: 'CREATE', deviceId: 'device-a' };
    const created = await app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: input });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.run.status).toBe('WAITING_HUMAN');
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('TODO');
    expect(await db.artifact.count()).toBe(0);
    const stored = await db.humanConfirmation.findUniqueOrThrow({ where: { id: body.humanConfirmation.id }, include: { agentRun: true, toolCall: true } });
    expect([stored.status, stored.agentRun.status, stored.toolCall.status, stored.toolCall.deviceId]).toEqual(['PENDING', 'WAITING_HUMAN', 'PENDING', 'device-a']);
    expect(JSON.stringify(stored)).not.toContain('content');
    expect((await app.inject({ method: 'POST', url: `/agent-runs/${body.run.id}/tool-results`, payload: { toolCallId: body.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath: input.relativePath, size: 10, encoding: 'utf-8', sha256: input.payloadSha256, effect: 'CREATE' } } })).statusCode).toBe(409);
    const detail = await app.inject({ method: 'GET', url: `/human-confirmations/${body.humanConfirmation.id}` });
    expect(detail.json()).toMatchObject({ action: 'write_file', relativePath: input.relativePath, effect: 'CREATE', payloadSize: 10, payloadSha256: input.payloadSha256, risk: 'MEDIUM', requiredPermission: 'LOCAL_CREATE' });
    expect(JSON.stringify(detail.json())).not.toMatch(/deviceId|localPath|content|executionGrant/);
    expect((await app.inject({ method: 'POST', url: `/human-confirmations/${body.humanConfirmation.id}/approve` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/human-confirmations/${body.humanConfirmation.id}/approve` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/agent-runs/${body.run.id}/tool-results`, payload: { toolCallId: body.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath: input.relativePath, size: 10, encoding: 'utf-8', sha256: input.payloadSha256, effect: 'CREATE' } } })).statusCode).toBe(200);
    const terminalRetry = await app.inject({ method: 'POST', url: `/human-confirmations/${body.humanConfirmation.id}/approve` });
    expect(terminalRetry.statusCode).toBe(200);
    expect(terminalRetry.json()).toMatchObject({ confirmation: { status: 'APPROVED' } });
    expect(terminalRetry.json().executionGrant).toBeUndefined();
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('TODO');
    expect(await db.artifact.count()).toBe(0);
    await app.close();
  });

  it('accepts a valid approved write success receipt and records a safe failed write receipt', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const createWrite = async (suffix: string) => app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'write_file', relativePath: `docs/${suffix}.md`, payloadSize: 4, payloadSha256: 'a'.repeat(64), effect: 'CREATE', deviceId: 'device-a' } });
    const first = (await createWrite('success')).json();
    const approved = await app.inject({ method: 'POST', url: `/human-confirmations/${first.humanConfirmation.id}/approve` });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().executionGrant).toMatchObject({ deviceId: 'device-a', effect: 'CREATE' });
    const succeeded = await app.inject({ method: 'POST', url: `/agent-runs/${first.run.id}/tool-results`, payload: { toolCallId: first.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath: 'docs/success.md', size: 4, encoding: 'utf-8', sha256: 'a'.repeat(64), effect: 'CREATE' } } });
    expect(succeeded.statusCode).toBe(200);
    const second = (await createWrite('failure')).json();
    await app.inject({ method: 'POST', url: `/human-confirmations/${second.humanConfirmation.id}/approve` });
    const failed = await app.inject({ method: 'POST', url: `/agent-runs/${second.run.id}/tool-results`, payload: { toolCallId: second.toolRequest.id, status: 'FAILED', error: { code: 'LOCAL_IO_ERROR', message: 'safe failure', details: {} } } });
    expect(failed.statusCode).toBe(200);
    expect(await db.agentToolCall.findUniqueOrThrow({ where: { id: second.toolRequest.id } })).toMatchObject({ status: 'FAILED' });
    expect(await db.agentRun.findUniqueOrThrow({ where: { id: second.run.id } })).toMatchObject({ status: 'FAILED' });
    const failedRetry = await app.inject({ method: 'POST', url: `/human-confirmations/${second.humanConfirmation.id}/approve` });
    expect(failedRetry.statusCode).toBe(200);
    expect(failedRetry.json().executionGrant).toBeUndefined();
    await app.close();
  });

  it('uses decision CAS so concurrent approve and reject have one durable winner', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const created = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'write_file', relativePath: 'docs/a.md', payloadSize: 0, payloadSha256: 'a'.repeat(64), effect: 'CREATE', deviceId: 'device-a' } })).json();
    const id = created.humanConfirmation.id;
    const [approve, reject] = await Promise.all([
      app.inject({ method: 'POST', url: `/human-confirmations/${id}/approve` }),
      app.inject({ method: 'POST', url: `/human-confirmations/${id}/reject` })
    ]);
    expect([approve.statusCode, reject.statusCode].sort()).toEqual([200, 409]);
    const stored = await db.humanConfirmation.findUniqueOrThrow({ where: { id }, include: { agentRun: true, toolCall: true } });
    if (stored.status === 'APPROVED') expect([stored.agentRun.status, stored.toolCall.status]).toEqual(['RUNNING', 'PENDING']);
    else expect([stored.status, stored.agentRun.status, stored.toolCall.status]).toEqual(['REJECTED', 'CANCELLED', 'CANCELLED']);
    await app.close();
  });

  it('rejects idempotently and cancels the pending write run and ToolCall', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const created = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'write_file', relativePath: 'docs/a.md', payloadSize: 0, payloadSha256: 'a'.repeat(64), effect: 'CREATE', deviceId: 'device-a' } })).json();
    const first = await app.inject({ method: 'POST', url: `/human-confirmations/${created.humanConfirmation.id}/reject` });
    const retry = await app.inject({ method: 'POST', url: `/human-confirmations/${created.humanConfirmation.id}/reject` });
    expect([first.statusCode, retry.statusCode]).toEqual([200, 200]);
    const stored = await db.humanConfirmation.findUniqueOrThrow({ where: { id: created.humanConfirmation.id }, include: { agentRun: true, toolCall: true } });
    expect([stored.status, stored.agentRun.status, stored.toolCall.status]).toEqual(['REJECTED', 'CANCELLED', 'CANCELLED']);
    await app.close();
  });

  it('fails closed when the persisted write request is malformed', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const created = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'write_file', relativePath: 'docs/a.md', payloadSize: 0, payloadSha256: 'a'.repeat(64), effect: 'CREATE', deviceId: 'device-a' } })).json();
    await db.agentToolCall.update({ where: { id: created.toolRequest.id }, data: { request: { ...created.toolRequest, content: 'not-permitted' } } });
    expect((await app.inject({ method: 'GET', url: `/human-confirmations/${created.humanConfirmation.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/human-confirmations/${created.humanConfirmation.id}/approve` })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/agent-runs/${created.run.id}/tool-results`, payload: { toolCallId: created.toolRequest.id, status: 'FAILED', error: { code: 'LOCAL_IO_ERROR', message: 'safe', details: {} } } })).statusCode).toBe(400);
    await app.close();
  });

  it('rejects formal ToolCall name/request disagreement without changing the run', async () => {
    const db = requireDatabase();
    const app = await createApp({ prisma: db });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const created = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'write_file', relativePath: 'docs/a.md', payloadSize: 0, payloadSha256: 'a'.repeat(64), effect: 'CREATE', deviceId: 'device-a' } })).json();
    await db.agentToolCall.update({ where: { id: created.toolRequest.id }, data: { name: 'read_file' } });
    const completion = await app.inject({ method: 'POST', url: `/agent-runs/${created.run.id}/tool-results`, payload: { toolCallId: created.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath: 'docs/a.md', size: 0, encoding: 'utf-8', sha256: 'a'.repeat(64), effect: 'CREATE' } } });
    expect(completion.statusCode).toBe(400);
    expect(await db.agentToolCall.findUniqueOrThrow({ where: { id: created.toolRequest.id } })).toMatchObject({ name: 'read_file', status: 'PENDING' });
    expect(await db.agentRun.findUniqueOrThrow({ where: { id: created.run.id } })).toMatchObject({ status: 'WAITING_HUMAN' });
    await app.close();
  });

  it('hides confirmations from revoked owners and other current project members', async () => {
    const db = requireDatabase();
    const owner = await createApp({ prisma: db });
    const project = (await owner.inject({ method: 'POST', url: '/projects', payload: { name: 'Project' } })).json();
    const task = (await owner.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Task' } })).json();
    const created = (await owner.inject({ method: 'POST', url: `/tasks/${task.id}/agent-runs`, payload: { name: 'write_file', relativePath: 'docs/a.md', payloadSize: 0, payloadSha256: 'a'.repeat(64), effect: 'CREATE', deviceId: 'device-a' } })).json();
    const id = created.humanConfirmation.id;
    await db.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: 'dev-user' } } });
    expect((await owner.inject({ method: 'GET', url: `/human-confirmations/${id}` })).statusCode).toBe(404);
    expect((await owner.inject({ method: 'POST', url: `/human-confirmations/${id}/approve` })).statusCode).toBe(404);
    expect((await owner.inject({ method: 'POST', url: `/human-confirmations/${id}/reject` })).statusCode).toBe(404);
    await db.user.create({ data: { id: 'member-user', name: 'Member', systemRole: 'EMPLOYEE', createdAt: new Date(), updatedAt: new Date() } });
    await db.projectMember.create({ data: { id: 'member-user-project', projectId: project.id, userId: 'member-user', role: 'MEMBER', createdAt: new Date(), updatedAt: new Date() } });
    const member = await createApp({ prisma: db, identityProvider: new DevIdentityProvider({ id: 'member-user' }) });
    expect((await member.inject({ method: 'GET', url: `/human-confirmations/${id}` })).statusCode).toBe(404);
    expect((await member.inject({ method: 'POST', url: `/human-confirmations/${id}/approve` })).statusCode).toBe(404);
    expect((await member.inject({ method: 'POST', url: `/human-confirmations/${id}/reject` })).statusCode).toBe(404);
    await member.close();
    await owner.close();
  });
});
