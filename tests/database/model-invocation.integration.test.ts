/* eslint-disable @typescript-eslint/no-explicit-any -- the transaction proxy injects one production write boundary. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ModelInvocationRepository, createPrismaClient } from '../../packages/database/src/index.js';
import { modelRequestFingerprint, normalizeModelPrompt } from '../../packages/domain/src/index.js';

const database = process.env.DATABASE_URL ? createPrismaClient(process.env.DATABASE_URL) : undefined;
const db = () => { if (!database) throw new Error('DATABASE_URL is required for database integration tests'); return database; };
const now = new Date('2026-09-09T00:00:00.000Z');

async function clean() { const c = db(); await c.modelInvocation.deleteMany(); await c.auditEvent.deleteMany(); await c.session.deleteMany(); await c.account.deleteMany(); await c.humanConfirmation.deleteMany(); await c.review.deleteMany(); await c.resultArtifact.deleteMany(); await c.result.deleteMany(); await c.artifact.deleteMany(); await c.agentToolCall.deleteMany(); await c.agentRun.deleteMany(); await c.agentAssignment.deleteMany(); await c.agentVersion.deleteMany(); await c.agentDefinition.deleteMany(); await c.taskDependency.deleteMany(); await c.taskAssignment.deleteMany(); await c.task.deleteMany(); await c.projectMember.deleteMany(); await c.project.deleteMany(); await c.departmentMembership.deleteMany(); await c.permissionOverride.deleteMany(); await c.organizationMembership.deleteMany(); await c.department.deleteMany(); await c.organization.deleteMany(); await c.user.deleteMany(); }
async function fixture() {
  const c = db();
  await c.user.createMany({ data: ['owner', 'member', 'outsider'].map(id => ({ id, name: id, systemRole: 'EMPLOYEE' as const, createdAt: now, updatedAt: now })) });
  await c.account.createMany({ data: ['owner', 'member', 'outsider'].map(id => ({ id: `account-${id}`, userId: id, login: `${id}@example.test`, passwordHash: 'hash', status: 'ACTIVE' as const, createdAt: now, updatedAt: now })) });
  await c.organization.createMany({ data: [{ id: 'org-a', name: 'Organization A', status: 'ACTIVE', createdAt: now, updatedAt: now }, { id: 'org-b', name: 'Organization B', status: 'ACTIVE', createdAt: now, updatedAt: now }] });
  await c.organizationMembership.createMany({ data: [{ id: 'owner-org', organizationId: 'org-a', userId: 'owner', role: 'OWNER', status: 'ACTIVE', createdAt: now, updatedAt: now }, { id: 'member-org', organizationId: 'org-a', userId: 'member', role: 'MEMBER', status: 'ACTIVE', createdAt: now, updatedAt: now }, { id: 'outsider-org', organizationId: 'org-b', userId: 'outsider', role: 'MEMBER', status: 'ACTIVE', createdAt: now, updatedAt: now }] });
  await c.project.create({ data: { id: 'project-a', name: 'Project A', goal: 'Goal', status: 'ACTIVE', createdAt: now, updatedAt: now } });
  await c.projectMember.createMany({ data: [{ id: 'owner-project', projectId: 'project-a', userId: 'owner', role: 'OWNER', createdAt: now, updatedAt: now }, { id: 'member-project', projectId: 'project-a', userId: 'member', role: 'MEMBER', createdAt: now, updatedAt: now }] });
  await c.task.createMany({ data: [{ id: 'task-a', projectId: 'project-a', title: 'Task A', description: 'Describe task', priority: 'P2', status: 'IN_PROGRESS', acceptanceCriteria: [], createdAt: now, updatedAt: now }, { id: 'task-b', projectId: 'project-a', title: 'Task B', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: new Date(now.getTime() + 1), updatedAt: now }] });
  await c.agentDefinition.create({ data: { id: 'agent-a', organizationId: 'org-a', key: 'model-agent', name: 'Model Agent', description: 'Uses a model', status: 'ACTIVE', createdAt: now, updatedAt: now } });
  await c.agentVersion.create({ data: { id: 'version-a', agentDefinitionId: 'agent-a', version: 1, runtimeProfile: 'READ_ONLY_WORK', status: 'ACTIVE', createdAt: now } });
  await c.agentAssignment.create({ data: { id: 'assignment-a', organizationId: 'org-a', agentDefinitionId: 'agent-a', scopeType: 'ORGANIZATION', scopeId: 'org-a', status: 'ACTIVE', createdAt: now, updatedAt: now } });
}
function input(overrides: Partial<{ agentRunId:string; invocationId:string; userId:string; taskId:string; agentId:string; prompt:string; idempotencyKey:string }> = {}) {
  const value = { agentRunId: 'run-a', invocationId: 'invocation-a', userId: 'member', taskId: 'task-a', agentId: 'agent-a', prompt: normalizeModelPrompt('  summarize this\ncarefully  '), idempotencyKey: 'model-key-a', ...overrides };
  return { ...value, requestFingerprint: modelRequestFingerprint({ userId: value.userId, taskId: value.taskId, agentId: value.agentId, prompt: value.prompt }), provider: 'openai', model: 'gpt-test', now };
}

describe('ModelInvocationRepository PostgreSQL integration', () => {
  beforeEach(clean); afterAll(async () => { if (database) await clean(); await database?.$disconnect(); });

  it('creates one authorized MODEL AgentRun and RUNNING ModelInvocation', async () => {
    await fixture(); const result = await new ModelInvocationRepository(db()).beginForTask(input());
    if (typeof result === 'string') throw new Error(result);
    expect(result.disposition).toBe('CREATED'); expect(result.invocation.status).toBe('RUNNING'); expect(result.context).toMatchObject({ organizationName: 'Organization A', projectName: 'Project A', taskTitle: 'Task A', agentName: 'Model Agent', agentVersion: 1 });
    expect(await db().agentRun.findUniqueOrThrow({ where: { id: 'run-a' } })).toMatchObject({ kind: 'MODEL', status: 'RUNNING', agentDefinitionKey: 'model-agent', agentVersion: 1 });
    expect(await db().agentToolCall.count()).toBe(0); expect(await db().result.count()).toBe(0); expect(await db().artifact.count()).toBe(0); expect(await db().review.count()).toBe(0);
  });

  it('rejects unauthorized model runs without AgentRun or Invocation writes', async () => {
    await fixture(); const repo = new ModelInvocationRepository(db());
    const cases = [
      async () => repo.beginForTask(input({ userId: 'outsider' })),
      async () => { await db().organizationMembership.update({ where: { userId: 'member' }, data: { status: 'DISABLED' } }); return repo.beginForTask(input()); },
      async () => { await db().agentAssignment.deleteMany(); return repo.beginForTask(input()); },
      async () => { await db().agentAssignment.update({ where: { id: 'assignment-a' }, data: { status: 'DISABLED' } }); return repo.beginForTask(input()); },
      async () => { await db().agentDefinition.update({ where: { id: 'agent-a' }, data: { status: 'DISABLED' } }); return repo.beginForTask(input()); },
      async () => { await db().agentVersion.update({ where: { id: 'version-a' }, data: { status: 'DISABLED' } }); return repo.beginForTask(input()); },
      async () => { await db().permissionOverride.create({ data: { id: 'deny', organizationId: 'org-a', userId: 'member', scopeType: 'ORGANIZATION', scopeId: 'org-a', resource: 'AGENT', action: 'EXECUTE', effect: 'DENY', createdAt: now, updatedAt: now } }); return repo.beginForTask(input()); }
    ];
    for (const attempt of cases) { await clean(); await fixture(); expect(typeof await attempt()).toBe('string'); expect(await db().agentRun.count()).toBe(0); expect(await db().modelInvocation.count()).toBe(0); }
  });

  it('reuses an idempotent run and rejects mismatched fingerprints', async () => {
    await fixture(); const repo = new ModelInvocationRepository(db()); const first = await repo.beginForTask(input()); const second = await repo.beginForTask(input({ agentRunId: 'run-b', invocationId: 'invocation-b' }));
    if (typeof first === 'string' || typeof second === 'string') throw new Error('unexpected rejection');
    expect(second).toMatchObject({ disposition: 'EXISTING_RUNNING', invocation: { id: first.invocation.id } });
    expect(await repo.beginForTask(input({ agentRunId: 'run-c', invocationId: 'invocation-c', prompt: 'different prompt' }))).toBe('IDEMPOTENCY_CONFLICT');
    await db().agentDefinition.create({ data: { id: 'different-agent', organizationId: 'org-a', key: 'second-model-agent', name: 'Second', status: 'ACTIVE', createdAt: now, updatedAt: now } });
    await db().agentVersion.create({ data: { id: 'different-version', agentDefinitionId: 'different-agent', version: 1, runtimeProfile: 'READ_ONLY_WORK', status: 'ACTIVE', createdAt: now } });
    await db().agentAssignment.create({ data: { id: 'different-assignment', organizationId: 'org-a', agentDefinitionId: 'different-agent', scopeType: 'ORGANIZATION', scopeId: 'org-a', status: 'ACTIVE', createdAt: now, updatedAt: now } });
    expect(await repo.beginForTask(input({ agentRunId: 'run-d', invocationId: 'invocation-d', agentId: 'different-agent' }))).toBe('IDEMPOTENCY_CONFLICT');
    expect(await db().agentRun.count()).toBe(1); expect(await db().modelInvocation.count()).toBe(1);
  });

  it('coordinates concurrent same-key model run creation through the production repository', async () => {
    await fixture(); const connection = process.env.DATABASE_URL!; const second = createPrismaClient(connection); const gate = barrier(2);
    const wrap = (client:any) => new Proxy(client, { get(target, key) { if (key !== '$transaction') return Reflect.get(target, key); return async (callback:any, options:any) => target.$transaction((tx:any) => callback(new Proxy(tx, { get(inner, innerKey) { const value = Reflect.get(inner, innerKey); if (innerKey !== 'modelInvocation') return value; return new Proxy(value, { get(model, method) { if (method === 'create') return async (...args:any[]) => { await gate.arrive(); return model.create(...args); }; return Reflect.get(model, method); } }); } })), options); } });
    try {
      const [left, right] = await Promise.all([
        new ModelInvocationRepository(wrap(db())).beginForTask(input()),
        new ModelInvocationRepository(wrap(second)).beginForTask(input({ agentRunId: 'run-concurrent', invocationId: 'invocation-concurrent' }))
      ]);
      if (typeof left === 'string' || typeof right === 'string') throw new Error(`unexpected concurrency outcome: ${left}/${right}`);
      expect(new Set([left.invocation.id, right.invocation.id]).size).toBe(1); expect(await db().modelInvocation.count()).toBe(1); expect(await db().agentRun.count()).toBe(1);
    } finally { await second.$disconnect(); }
  });

  it('completes or fails a model invocation exactly once and rolls back a failed Run transition', async () => {
    await fixture(); const c = db(); const repo = new ModelInvocationRepository(c); const started = await repo.beginForTask(input()); if (typeof started === 'string') throw new Error(started);
    const complete = { invocationId: started.invocation.id, providerResponseId: 'response-1', outputText: 'answer', model: 'gpt-test', inputTokens: 1, outputTokens: 2, totalTokens: 3, completedAt: new Date(now.getTime() + 10) };
    expect(await repo.complete(complete)).toMatchObject({ status: 'COMPLETED', outputText: 'answer', totalTokens: 3 }); expect(await c.agentRun.findUniqueOrThrow({ where: { id: 'run-a' } })).toMatchObject({ status: 'SUCCEEDED' }); expect(await repo.complete(complete)).toMatchObject({ status: 'COMPLETED' }); expect(await repo.fail({ invocationId: started.invocation.id, errorCode: 'MODEL_PROVIDER_FAILED', completedAt: complete.completedAt })).toBe('INVALID_STATE_TRANSITION');
    const failed = await repo.beginForTask(input({ agentRunId: 'run-fail', invocationId: 'invocation-fail', idempotencyKey: 'fail-key' })); if (typeof failed === 'string') throw new Error(failed); const failure = { invocationId: failed.invocation.id, errorCode: 'MODEL_PROVIDER_TIMEOUT', completedAt: complete.completedAt }; expect(await repo.fail(failure)).toMatchObject({ status: 'FAILED', errorCode: 'MODEL_PROVIDER_TIMEOUT' }); expect(await c.agentRun.findUniqueOrThrow({ where: { id: 'run-fail' } })).toMatchObject({ status: 'FAILED' }); expect(await repo.fail(failure)).toMatchObject({ status: 'FAILED', errorCode: 'MODEL_PROVIDER_TIMEOUT' }); expect((await c.modelInvocation.findUniqueOrThrow({ where: { id: failed.invocation.id } })).outputText).toBeNull();
    const wrapped = new Proxy(c, { get(target, key) { if (key !== '$transaction') return Reflect.get(target, key); return async (callback:any, options:any) => target.$transaction((tx:any) => callback(new Proxy(tx, { get(inner, innerKey) { const value = Reflect.get(inner, innerKey); if (innerKey !== 'agentRun') return value; return new Proxy(value, { get(model, method) { if (method === 'updateMany') return async () => ({ count: 0 }); return Reflect.get(model, method); } }); } })), options); } });
    const rollback = await new ModelInvocationRepository(wrapped as typeof c).beginForTask(input({ agentRunId: 'run-rollback', invocationId: 'invocation-rollback', idempotencyKey: 'rollback-key' })); if (typeof rollback === 'string') throw new Error(rollback); expect(await new ModelInvocationRepository(wrapped as typeof c).complete({ invocationId: rollback.invocation.id, outputText: 'no', model: 'gpt-test', completedAt: complete.completedAt })).toBe('INVALID_STATE_TRANSITION'); expect(await c.modelInvocation.findUniqueOrThrow({ where: { id: rollback.invocation.id } })).toMatchObject({ status: 'RUNNING', completedAt: null });
  });

  it('lists only authorized Task model invocations newest first with a bounded limit', async () => {
    await fixture(); const repo = new ModelInvocationRepository(db()); for (const [suffix, taskId] of [['one', 'task-a'], ['two', 'task-a'], ['other', 'task-b']] as const) { const value = await repo.beginForTask(input({ agentRunId: `run-${suffix}`, invocationId: `invocation-${suffix}`, taskId, idempotencyKey: `key-${suffix}` })); if (typeof value === 'string') throw new Error(value); }
    const rows = await repo.listForTaskForMember({ userId: 'member', taskId: 'task-a', limit: 1 }); expect(Array.isArray(rows) && rows).toHaveLength(1); expect(Array.isArray(rows) && rows[0]?.agentRunId).toBe('run-two'); expect(await repo.listForTaskForMember({ userId: 'outsider', taskId: 'task-a' })).toBe('NOT_FOUND');
  });
});

function barrier(parties:number) { let count = 0; let release!: () => void; let timeout: ReturnType<typeof setTimeout> | undefined; let reject!: (error: Error) => void; const ready = new Promise<void>((resolve, fail) => { release = resolve; reject = fail; timeout = setTimeout(() => reject(new Error('concurrency barrier timed out')), 10_000); }); return { async arrive() { count += 1; if (count === parties) { if (timeout) clearTimeout(timeout); release(); } await ready; } }; }
