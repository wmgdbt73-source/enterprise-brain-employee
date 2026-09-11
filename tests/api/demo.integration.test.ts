import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../../apps/api/src/app.js';
import { createPrismaClient } from '../../packages/database/src/index.js';

const execute = promisify(execFile);
const database = process.env.DATABASE_URL
  ? createPrismaClient(process.env.DATABASE_URL)
  : undefined;
const db = () => {
  if (!database)
    throw new Error('DATABASE_URL is required for demo integration tests');
  return database;
};
async function clean() {
  const c = db();
  await c.message.deleteMany();
  await c.conversationParticipant.deleteMany();
  await c.conversation.deleteMany();
  await c.notification.deleteMany();
  await c.reminder.deleteMany();
  await c.swarmEvent.deleteMany();
  await c.modelInvocation.deleteMany();
  await c.auditEvent.deleteMany();
  await c.session.deleteMany();
  await c.account.deleteMany();
  await c.humanConfirmation.deleteMany();
  await c.review.deleteMany();
  await c.resultArtifact.deleteMany();
  await c.result.deleteMany();
  await c.artifact.deleteMany();
  await c.agentToolCall.deleteMany();
  await c.agentRun.deleteMany();
  await c.agentAssignment.deleteMany();
  await c.agentVersion.deleteMany();
  await c.agentDefinition.deleteMany();
  await c.taskDependency.deleteMany();
  await c.taskAssignment.deleteMany();
  await c.task.deleteMany();
  await c.projectMember.deleteMany();
  await c.project.deleteMany();
  await c.departmentMembership.deleteMany();
  await c.permissionOverride.deleteMany();
  await c.organizationMembership.deleteMany();
  await c.department.deleteMany();
  await c.organization.deleteMany();
  await c.user.deleteMany();
}

describe('seeded demo API walkthrough', () => {
  beforeEach(clean);
  afterAll(async () => database?.$disconnect());
  it('exposes coherent employee collaboration data and preserves the admin boundary', async () => {
    await execute('pnpm', ['db:seed:demo'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL! }
    });
    const app = await createApp({ prisma: db() });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'employee@example.test', password: 'DemoEmployee!2026' }
    });
    const headers = { authorization: `Bearer ${login.json().token as string}` };
    expect(login.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/projects', headers })).json()
    ).toEqual({
      projects: [expect.objectContaining({ id: 'demo-review-project' })]
    });
    expect(
      (await app.inject({ method: 'GET', url: '/me/agents', headers })).json()
        .agents
    ).toHaveLength(2);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/projects/demo-review-project/tasks',
          headers
        })
      ).json().tasks
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'demo-task-review',
          status: 'READY_FOR_REVIEW'
        })
      ])
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/conversations?scopeType=PROJECT&scopeId=demo-review-project',
          headers
        })
      ).json().items
    ).toEqual([
      expect.objectContaining({
        conversationId: 'demo-human-group',
        type: 'HUMAN_GROUP'
      })
    ]);
    expect(
      (
        await app.inject({ method: 'GET', url: '/notifications', headers })
      ).json().items
    ).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/library-items?scopeType=PROJECT&scopeId=demo-review-project',
          headers
        })
      ).json().items.length
    ).toBeGreaterThan(1);
    expect(
      (
        await app.inject({ method: 'GET', url: '/action-items', headers })
      ).json()
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionItemId: 'result:demo-result-draft' })
      ])
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/agents',
          headers,
          payload: {
            key: 'forbidden',
            name: 'Forbidden',
            runtimeProfile: 'READ_ONLY_WORK'
          }
        })
      ).statusCode
    ).toBe(403);
    await app.close();
  }, 20_000);
});
