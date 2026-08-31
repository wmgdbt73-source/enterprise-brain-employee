import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { DevIdentityProvider } from '../../apps/api/src/identity/dev-identity-provider.js';
import { createPrismaClient } from '../../packages/database/src/index.js';
import type { PrismaClient } from '../../packages/database/src/generated/prisma/client.js';

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
    await db().session.deleteMany(); await db().account.deleteMany(); await db().humanConfirmation.deleteMany(); await db().review.deleteMany(); await db().resultArtifact.deleteMany(); await db().result.deleteMany(); await db().artifact.deleteMany(); await db().agentToolCall.deleteMany(); await db().agentRun.deleteMany(); await db().taskDependency.deleteMany(); await db().taskAssignment.deleteMany(); await db().task.deleteMany(); await db().projectMember.deleteMany(); await db().project.deleteMany(); await db().user.deleteMany();
  });
  afterAll(async () => database?.$disconnect());

  it('creates canonical Candidate Results idempotently without changing Artifact, Task, or AgentRun', async () => {
    const app = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider() });
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
    const app = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider() });
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
    const app = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider() });
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
    const sameGate = boundedGate(2);
    const primaryClient = createPrismaClient(process.env.DATABASE_URL!);
    const secondaryClient = createPrismaClient(process.env.DATABASE_URL!);
    const app = await createApp({ prisma: wrapPrismaForResultApiTest(primaryClient, {
      beforeResultCreate: () => sameGate.arriveAndWait()
    }), identityProvider: new DevIdentityProvider() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const a = await artifact(app, task.id, 'a.md');
    const b = await artifact(app, task.id, 'b.md', 'b'.repeat(64));
    const sameARequest = app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('10') }, payload: { artifactIds: [a.id, b.id] } });
    const sameApp = await createApp({ prisma: wrapPrismaForResultApiTest(secondaryClient, {
      beforeResultCreate: () => sameGate.arriveAndWait()
    }), identityProvider: new DevIdentityProvider() });
    const sameBRequest = sameApp.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('10') }, payload: { artifactIds: [a.id, b.id] } });
    await sameGate.waitUntilReached();
    expect(sameGate.arrivals).toBe(2);
    sameGate.release();
    const [sameA, sameB] = await Promise.all([sameARequest, sameBRequest]);
    expect([sameA.statusCode, sameB.statusCode].sort()).toEqual([200, 201]);
    expect(sameA.json().id).toBe(sameB.json().id);
    expect(await db().result.count({ where: { taskId: task.id } })).toBe(1);
    expect(await db().resultArtifact.count({ where: { resultId: sameA.json().id } })).toBe(2);

    sameGate.cleanup();
    const conflictGate = boundedGate(2);
    const conflictApp = await createApp({ prisma: wrapPrismaForResultApiTest(secondaryClient, {
      beforeResultCreate: () => conflictGate.arriveAndWait()
    }), identityProvider: new DevIdentityProvider() });
    const left = conflictApp.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('11') }, payload: { artifactIds: [a.id] } });
    const right = conflictApp.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('11') }, payload: { artifactIds: [b.id] } });
    await conflictGate.waitUntilReached();
    expect(conflictGate.arrivals).toBe(2);
    conflictGate.release();
    const responses = await Promise.all([left, right]);
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(1);
    expect(await db().result.count({ where: { taskId: task.id } })).toBe(2);
    const winner = responses.find((response) => response.statusCode === 201)!.json();
    const links = await db().resultArtifact.findMany({ where: { resultId: winner.id }, orderBy: { artifactId: 'asc' } });
    expect(links.map((link) => link.artifactId)).toEqual(winner.artifactIds);
    expect(await db().result.count({ where: { idempotencyKey: key('11') } })).toBe(1);
    conflictGate.cleanup();
    await conflictApp.close(); await sameApp.close(); await app.close();
    await primaryClient.$disconnect(); await secondaryClient.$disconnect();
  });

  it('coordinates submission and human ACCEPT with the owning Task', async () => {
    const app = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const dependent = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Dependent', dependencyIds: [task.id] } })).json();
    const registered = await artifact(app, task.id, 'a.md');
    const created = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('12') }, payload: { artifactIds: [registered.id] } });
    const result = created.json();
    await app.inject({ method: 'POST', url: `/tasks/${task.id}/start` });
    const submitted = await app.inject({ method: 'POST', url: `/results/${result.id}/submit-review`, payload: {} });
    expect(submitted.json()).toMatchObject({ status: 'HUMAN_REVIEW', submittedByUserId: 'dev-user' });
    const firstSubmittedAt = submitted.json().submittedAt;
    const firstTaskUpdatedAt = (await db().task.findUniqueOrThrow({ where: { id: task.id } })).updatedAt;
    expect((await app.inject({ method: 'POST', url: `/results/${result.id}/submit-review`, payload: {} })).json().submittedAt).toBe(firstSubmittedAt);
    expect((await db().task.findUniqueOrThrow({ where: { id: task.id } })).updatedAt).toEqual(firstTaskUpdatedAt);
    expect((await db().task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('READY_FOR_REVIEW');
    expect((await app.inject({ method: 'POST', url: `/results/${result.id}/reviews`, payload: { decision: 'ACCEPT' } })).statusCode).toBe(403);
    await db().user.create({ data: { id: 'reviewer-1', name: 'Reviewer', systemRole: 'EMPLOYEE', createdAt: new Date(), updatedAt: new Date() } });
    await db().projectMember.create({ data: { id: 'member-reviewer-1', projectId: project.id, userId: 'reviewer-1', role: 'REVIEWER', createdAt: new Date(), updatedAt: new Date() } });
    const reviewer = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider({ id: 'reviewer-1', name: 'Reviewer' }) });
    const accepted = await reviewer.inject({ method: 'POST', url: `/results/${result.id}/reviews`, payload: { decision: 'ACCEPT', comment: ' looks good ' } });
    expect(accepted.statusCode).toBe(201); expect(accepted.json()).toMatchObject({ resultId: result.id, reviewerId: 'reviewer-1', decision: 'ACCEPT', comment: 'looks good' });
    const acceptedTaskUpdatedAt = (await db().task.findUniqueOrThrow({ where: { id: task.id } })).updatedAt;
    expect((await reviewer.inject({ method: 'POST', url: `/results/${result.id}/reviews`, payload: { decision: 'ACCEPT', comment: 'looks good' } })).statusCode).toBe(200);
    expect((await db().task.findUniqueOrThrow({ where: { id: task.id } })).updatedAt).toEqual(acceptedTaskUpdatedAt);
    expect((await app.inject({ method: 'GET', url: `/results/${result.id}/reviews` })).json().reviews).toHaveLength(1);
    expect((await db().result.findUniqueOrThrow({ where: { id: result.id } })).status).toBe('ACCEPTED');
    expect((await db().task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('ACCEPTED');
    expect((await reviewer.inject({ method: 'POST', url: `/tasks/${dependent.id}/start` })).statusCode).toBe(200);
    await reviewer.close(); await app.close();
  });

  it('returns REWORK Result and Task IN_PROGRESS atomically', async () => {
    const app = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Rework' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const registered = await artifact(app, task.id, 'a.md');
    const created = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('15') }, payload: { artifactIds: [registered.id] } })).json();
    await app.inject({ method: 'POST', url: `/tasks/${task.id}/start` });
    await app.inject({ method: 'POST', url: `/results/${created.id}/submit-review`, payload: {} });
    await db().user.create({ data: { id: 'reviewer-rework', name: 'Reviewer', systemRole: 'EMPLOYEE', createdAt: new Date(), updatedAt: new Date() } });
    await db().projectMember.create({ data: { id: 'member-reviewer-rework', projectId: project.id, userId: 'reviewer-rework', role: 'REVIEWER', createdAt: new Date(), updatedAt: new Date() } });
    const reviewer = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider({ id: 'reviewer-rework' }) });
    expect((await reviewer.inject({ method: 'POST', url: `/results/${created.id}/reviews`, payload: { decision: 'REWORK' } })).statusCode).toBe(201);
    expect(await db().result.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ status: 'REWORK' });
    expect(await db().task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: 'IN_PROGRESS' });
    await reviewer.close(); await app.close();
  });

  it('enforces review role, ownership, hidden scope and terminal conflict boundaries', async () => {
    const app = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const registered = await artifact(app, task.id, 'a.md');
    const created = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('13') }, payload: { artifactIds: [registered.id] } })).json();
    await app.inject({ method: 'POST', url: `/tasks/${task.id}/start` });
    for (const [id, role, systemRole] of [['member-1', 'MEMBER', 'EMPLOYEE'], ['admin-1', 'MEMBER', 'ADMIN'], ['reviewer-2', 'REVIEWER', 'EMPLOYEE']] as const) {
      await db().user.create({ data: { id, name: id, systemRole, createdAt: new Date(), updatedAt: new Date() } });
      await db().projectMember.create({ data: { id: `membership-${id}`, projectId: project.id, userId: id, role, createdAt: new Date(), updatedAt: new Date() } });
    }
    const member = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider({ id: 'member-1', name: 'Member' }) });
    const admin = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider({ id: 'admin-1', name: 'Admin', systemRole: 'ADMIN' }) });
    const reviewer = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider({ id: 'reviewer-2', name: 'Reviewer' }) });
    expect((await member.inject({ method: 'POST', url: `/results/${created.id}/submit-review`, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/results/${created.id}/submit-review`, payload: { submittedByUserId: 'forged' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/results/${created.id}/submit-review`, payload: {} })).statusCode).toBe(200);
    expect((await member.inject({ method: 'POST', url: `/results/${created.id}/reviews`, payload: { decision: 'ACCEPT' } })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'POST', url: `/results/${created.id}/reviews`, payload: { decision: 'ACCEPT' } })).statusCode).toBe(403);
    expect((await reviewer.inject({ method: 'POST', url: `/results/${created.id}/reviews`, payload: { decision: 'REWORK', reviewerId: 'forged' } })).statusCode).toBe(400);
    expect((await reviewer.inject({ method: 'POST', url: `/results/${created.id}/reviews`, payload: { decision: 'REWORK', comment: 'needs work' } })).statusCode).toBe(201);
    expect((await reviewer.inject({ method: 'POST', url: `/results/${created.id}/reviews`, payload: { decision: 'ACCEPT' } })).statusCode).toBe(409);
    expect((await reviewer.inject({ method: 'POST', url: `/results/${created.id}/submit-review`, payload: {} })).statusCode).toBe(403);
    await db().projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: 'reviewer-2' } } });
    expect((await reviewer.inject({ method: 'GET', url: `/results/${created.id}/reviews` })).statusCode).toBe(404);
    await Promise.all([member.close(), admin.close(), reviewer.close(), app.close()]);
  });

  it('makes omitted and blank review comments the same idempotent request', async () => {
    const app = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider() });
    const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P' } })).json();
    const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'T' } })).json();
    const registered = await artifact(app, task.id, 'a.md');
    const result = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, headers: { 'idempotency-key': key('14') }, payload: { artifactIds: [registered.id] } })).json();
    await app.inject({ method: 'POST', url: `/tasks/${task.id}/start` });
    await app.inject({ method: 'POST', url: `/results/${result.id}/submit-review`, payload: {} });
    await db().user.create({ data: { id: 'reviewer-empty', name: 'Reviewer', systemRole: 'EMPLOYEE', createdAt: new Date(), updatedAt: new Date() } });
    await db().projectMember.create({ data: { id: 'member-reviewer-empty', projectId: project.id, userId: 'reviewer-empty', role: 'REVIEWER', createdAt: new Date(), updatedAt: new Date() } });
    const reviewer = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider({ id: 'reviewer-empty', name: 'Reviewer' }) });
    const first = await reviewer.inject({ method: 'POST', url: `/results/${result.id}/reviews`, payload: { decision: 'ACCEPT' } });
    const blank = await reviewer.inject({ method: 'POST', url: `/results/${result.id}/reviews`, payload: { decision: 'ACCEPT', comment: '   ' } });
    const changed = await reviewer.inject({ method: 'POST', url: `/results/${result.id}/reviews`, payload: { decision: 'ACCEPT', comment: 'different' } });
    expect(first.statusCode).toBe(201); expect(blank.statusCode).toBe(200); expect(blank.json().id).toBe(first.json().id); expect(changed.statusCode).toBe(409);
    await Promise.all([reviewer.close(), app.close()]);
  });
});

function wrapPrismaForResultApiTest(prisma: PrismaClient, hooks: { beforeResultCreate: () => Promise<void> | void }): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver) {
      if (property !== '$transaction') return Reflect.get(target, property, receiver);
      return async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => prisma.$transaction(async (transaction) => callback(new Proxy(transaction, {
        get(transactionTarget, transactionProperty, transactionReceiver) {
          const model = Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
          if (transactionProperty !== 'result' || typeof model !== 'object' || model === null) return model;
          return new Proxy(model, {
            get(resultTarget, resultProperty, resultReceiver) {
              const method = Reflect.get(resultTarget, resultProperty, resultReceiver);
              if (resultProperty !== 'create') return method;
              return async (...argumentsList: unknown[]) => {
                await hooks.beforeResultCreate();
                return Reflect.apply(method, resultTarget, argumentsList);
              };
            }
          });
        }
      }) as unknown), options as never);
    }
  }) as PrismaClient;
}

function boundedGate(parties: number, timeoutMs = 5_000) {
  let arrived = 0;
  let release!: () => void;
  let fail!: (error: Error) => void;
  let reached!: () => void;
  const opened = new Promise<void>((resolve, reject) => { release = resolve; fail = reject; });
  const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
  const timeout = setTimeout(() => fail(new Error(`timed out waiting for ${parties} Result transaction boundaries`)), timeoutMs);
  return {
    get arrivals() { return arrived; },
    async arriveAndWait() {
      arrived += 1;
      if (arrived === parties) reached();
      await opened;
    },
    waitUntilReached() { return reachedPromise; },
    release() { release(); },
    cleanup() { clearTimeout(timeout); release(); }
  };
}
