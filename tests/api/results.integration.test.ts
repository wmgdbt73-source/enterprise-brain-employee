import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { createPrismaClient } from '../../packages/database/src/index.js';

const database = process.env.DATABASE_URL ? createPrismaClient(process.env.DATABASE_URL) : undefined;
const key = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
function db() { if (!database) throw new Error('DATABASE_URL is required for API integration tests'); return database; }

async function artifact(app: Awaited<ReturnType<typeof createApp>>, taskId: string, path: string, hash = 'a'.repeat(64)) {
  const run = (await app.inject({ method: 'POST', url: `/tasks/${taskId}/agent-runs`, payload: { name: 'read_file', relativePath: path } })).json();
  await app.inject({ method: 'POST', url: `/agent-runs/${run.run.id}/tool-results`, payload: { toolCallId: run.toolRequest.id, status: 'SUCCEEDED', metadata: { relativePath: path, size: 1, encoding: 'utf-8', sha256: hash } } });
  return (await app.inject({ method: 'POST', url: '/artifacts', payload: { agentRunId: run.run.id } })).json();
}

describe('Result Candidate API', () => {
  beforeEach(async () => {
    await db().humanConfirmation.deleteMany(); await db().resultArtifact.deleteMany(); await db().result.deleteMany(); await db().artifact.deleteMany(); await db().agentToolCall.deleteMany(); await db().agentRun.deleteMany(); await db().taskDependency.deleteMany(); await db().taskAssignment.deleteMany(); await db().task.deleteMany(); await db().projectMember.deleteMany(); await db().project.deleteMany(); await db().user.deleteMany();
  });
  afterAll(async () => database?.$disconnect());

  it('creates canonical Candidate Results idempotently without changing Task or AgentRun', async () => {
    const app = await createApp({ prisma: db() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const a = await artifact(app, task.id, 'a.md'); const b = await artifact(app, task.id, 'b.md', 'b'.repeat(64));
    const first = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('1') }, payload: { artifactIds: [b.id, a.id] } });
    expect(first.statusCode).toBe(201); expect(first.json()).toMatchObject({ status: 'CANDIDATE', createdByUserId: 'dev-user', artifactIds: [a.id, b.id] });
    const retry = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('1') }, payload: { artifactIds: [a.id, b.id] } });
    expect(retry.statusCode).toBe(200); expect(retry.json()).toEqual(first.json());
    expect((await app.inject({ method: 'GET', url: `/results/${first.json().id}` })).json()).toEqual(first.json());
    expect((await db().task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('TODO');
    await app.close();
  });

  it('hides invalid Artifact scope and rejects invalid Candidate input', async () => {
    const app = await createApp({ prisma: db() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const otherTask = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Other' } })).json();
    const foreign = await artifact(app, otherTask.id, 'other.md');
    expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('2') }, payload: { artifactIds: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('2') }, payload: { artifactIds: [foreign.id, foreign.id] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('2') }, payload: { artifactIds: [foreign.id] } })).statusCode).toBe(404);
    await app.close();
  });
});
