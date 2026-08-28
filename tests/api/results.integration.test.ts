import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { DevIdentityProvider } from '../../apps/api/src/identity/dev-identity-provider.js';
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

  it('creates canonical Candidate Results idempotently without changing Artifact, Task, or AgentRun', async () => {
    const app = await createApp({ prisma: db() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const a = await artifact(app, task.id, 'a.md'); const b = await artifact(app, task.id, 'b.md', 'b'.repeat(64));
    const canonicalIds = [a.id, b.id].sort((left: string, right: string) => left < right ? -1 : left > right ? 1 : 0);
    const artifactsBefore = await db().artifact.findMany({ where: { taskId: task.id }, orderBy: { id: 'asc' } });
    const runsBefore = await db().agentRun.findMany({ where: { taskId: task.id }, orderBy: { id: 'asc' }, select: { id: true, status: true } });
    const first = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('1') }, payload: { artifactIds: [b.id, a.id] } });
    expect(first.statusCode).toBe(201); expect(first.json()).toMatchObject({ status: 'CANDIDATE', createdByUserId: 'dev-user', artifactIds: canonicalIds });
    const retry = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('1') }, payload: { artifactIds: canonicalIds } });
    expect(retry.statusCode).toBe(200); expect(retry.json()).toEqual(first.json());
    expect((await app.inject({ method: 'GET', url: `/results/${first.json().id}` })).json()).toEqual(first.json());
    expect((await db().task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('TODO');
    expect(await db().artifact.findMany({ where: { taskId: task.id }, orderBy: { id: 'asc' } })).toEqual(artifactsBefore);
    expect(await db().agentRun.findMany({ where: { taskId: task.id }, orderBy: { id: 'asc' }, select: { id: true, status: true } })).toEqual(runsBefore);

    const sameKeyDifferentSet = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('1') }, payload: { artifactIds: [a.id] } });
    expect(sameKeyDifferentSet).toMatchObject({ statusCode: 409 });
    expect(sameKeyDifferentSet.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_CONFLICT' } });
    const differentKeySameSet = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('3') }, payload: { artifactIds: canonicalIds } });
    expect(differentKeySameSet.statusCode).toBe(201);
    expect(differentKeySameSet.json().id).not.toBe(first.json().id);
    await app.close();
  });

  it('hides invalid Artifact scope and rejects invalid Candidate input', async () => {
    const app = await createApp({ prisma: db() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const otherTask = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Other' } })).json();
    const foreign = await artifact(app, otherTask.id, 'other.md');
    const secondProject = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P2' } })).json();
    const secondProjectTask = (await app.inject({ method: 'POST', url: `/projects/${secondProject.id}/tasks`, payload: { title: 'Other project' } })).json();
    const crossProject = await artifact(app, secondProjectTask.id, 'cross.md');
    const request = async (
      payload: { artifactIds: string[]; [field: string]: string | string[] },
      idempotencyKey = key('2')
    ) => app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': idempotencyKey }, payload });
    expect((await request({ artifactIds: [] })).statusCode).toBe(400);
    expect((await request({ artifactIds: [foreign.id, foreign.id] })).statusCode).toBe(400);
    expect((await request({ artifactIds: [foreign.id] })).statusCode).toBe(404);
    expect((await request({ artifactIds: [crossProject.id] }, key('4'))).statusCode).toBe(404);
    expect((await request({ artifactIds: ['missing-artifact'] }, key('5'))).statusCode).toBe(404);
    expect((await request({ artifactIds: [foreign.id], id: 'forged', projectId: 'forged', status: 'ACCEPTED', createdByUserId: 'forged', createdAt: 'now', updatedAt: 'now' }, key('6'))).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, payload: { artifactIds: [foreign.id] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': 'not-a-key' }, payload: { artifactIds: [foreign.id] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': 'x'.repeat(100) }, payload: { artifactIds: [foreign.id] } })).statusCode).toBe(400);
    expect(await db().result.count()).toBe(0);
    await app.close();
  });

  it('hides Result creation and reads when membership is absent or revoked', async () => {
    const app = await createApp({ prisma: db() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const registered = await artifact(app, task.id, 'a.md');
    const created = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('7') }, payload: { artifactIds: [registered.id] } });
    expect(created.statusCode).toBe(201);
    const outsider = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider({ id: 'result-outsider' }) });
    expect((await outsider.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('8') }, payload: { artifactIds: [registered.id] } })).statusCode).toBe(404);
    expect((await outsider.inject({ method: 'GET', url: `/results/${created.json().id}` })).statusCode).toBe(404);
    await db().projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: 'dev-user' } } });
    expect((await app.inject({ method: 'GET', url: `/results/${created.json().id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('7') }, payload: { artifactIds: [registered.id] } })).statusCode).toBe(404);
    await outsider.close(); await app.close();
  });

  it('makes overlapping Result creation atomic for same and conflicting idempotency requests', async () => {
    const app = await createApp({ prisma: db() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const a = await artifact(app, task.id, 'a.md');
    const b = await artifact(app, task.id, 'b.md', 'b'.repeat(64));
    const sameGate = barrier(2);
    const sameRequest = async () => {
      await sameGate.wait();
      return app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('10') }, payload: { artifactIds: [a.id, b.id] } });
    };
    const [sameA, sameB] = await Promise.all([sameRequest(), sameRequest()]);
    expect([sameA.statusCode, sameB.statusCode].sort()).toEqual([200, 201]);
    expect(sameA.json().id).toBe(sameB.json().id);
    expect(await db().result.count({ where: { taskId: task.id } })).toBe(1);
    expect(await db().resultArtifact.count({ where: { resultId: sameA.json().id } })).toBe(2);

    const conflictGate = barrier(2);
    const left = (async () => { await conflictGate.wait(); return app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('11') }, payload: { artifactIds: [a.id] } }); })();
    const right = (async () => { await conflictGate.wait(); return app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('11') }, payload: { artifactIds: [b.id] } }); })();
    const responses = await Promise.all([left, right]);
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(1);
    expect(await db().result.count({ where: { taskId: task.id } })).toBe(2);
    const links = await db().resultArtifact.findMany({ where: { result: { taskId: task.id } } });
    expect(links).toHaveLength(3);
    await app.close();
  });
});

function barrier(parties: number) {
  let arrived = 0;
  let release!: () => void;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  return {
    async wait() {
      arrived += 1;
      if (arrived === parties) release();
      await opened;
    }
  };
}
