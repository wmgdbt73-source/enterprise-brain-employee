import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { createPrismaClient, hashSessionToken } from '../../packages/database/src/index.js';
import { ModelProviderError, type ModelGeneration, type ModelGenerationRequest, type ModelProvider } from '../../apps/api/src/providers/model-provider.js';

const database = process.env.DATABASE_URL ? createPrismaClient(process.env.DATABASE_URL) : undefined;
const db = () => { if (!database) throw new Error('DATABASE_URL is required'); return database; };
const now = new Date('2026-09-10T00:00:00.000Z');
class FakeModelProvider implements ModelProvider {
  readonly providerName = 'FAKE'; readonly model = 'fake-model'; calls: ModelGenerationRequest[] = [];
  constructor(private readonly respond: () => Promise<ModelGeneration>) {}
  async generate(input: ModelGenerationRequest) { this.calls.push(input); return this.respond(); }
}
async function clean() { const c = db(); await c.modelInvocation.deleteMany(); await c.auditEvent.deleteMany(); await c.session.deleteMany(); await c.account.deleteMany(); await c.humanConfirmation.deleteMany(); await c.review.deleteMany(); await c.resultArtifact.deleteMany(); await c.result.deleteMany(); await c.artifact.deleteMany(); await c.agentToolCall.deleteMany(); await c.agentRun.deleteMany(); await c.agentAssignment.deleteMany(); await c.agentVersion.deleteMany(); await c.agentDefinition.deleteMany(); await c.taskDependency.deleteMany(); await c.taskAssignment.deleteMany(); await c.task.deleteMany(); await c.projectMember.deleteMany(); await c.project.deleteMany(); await c.departmentMembership.deleteMany(); await c.permissionOverride.deleteMany(); await c.organizationMembership.deleteMany(); await c.department.deleteMany(); await c.organization.deleteMany(); await c.user.deleteMany(); }
async function fixture() { const c = db(); await c.user.createMany({ data: ['employee', 'outsider'].map(id => ({ id, name: id, systemRole: 'EMPLOYEE' as const, createdAt: now, updatedAt: now })) }); await c.account.createMany({ data: ['employee', 'outsider'].map(id => ({ id: `account-${id}`, userId: id, login: `${id}@test.local`, passwordHash: 'test-only-not-used-for-login', status: 'ACTIVE' as const, createdAt: now, updatedAt: now })) }); await c.organization.createMany({ data: [{ id: 'org', name: 'Org', status: 'ACTIVE', createdAt: now, updatedAt: now }, { id: 'other-org', name: 'Other', status: 'ACTIVE', createdAt: now, updatedAt: now }] }); await c.organizationMembership.createMany({ data: [{ id: 'employee-org', organizationId: 'org', userId: 'employee', role: 'MEMBER', status: 'ACTIVE', createdAt: now, updatedAt: now }, { id: 'outsider-org', organizationId: 'other-org', userId: 'outsider', role: 'MEMBER', status: 'ACTIVE', createdAt: now, updatedAt: now }] }); await c.project.create({ data: { id: 'project', name: 'Project', status: 'ACTIVE', createdAt: now, updatedAt: now } }); await c.projectMember.create({ data: { id: 'employee-project', projectId: 'project', userId: 'employee', role: 'MEMBER', createdAt: now, updatedAt: now } }); await c.task.createMany({ data: [{ id: 'task', projectId: 'project', title: 'Task', description: 'Description', priority: 'P2', status: 'IN_PROGRESS', acceptanceCriteria: [], createdAt: now, updatedAt: now }, { id: 'other-task', projectId: 'project', title: 'Other', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: new Date(now.getTime() + 1), updatedAt: now }] }); await c.agentDefinition.create({ data: { id: 'agent', organizationId: 'org', key: 'model-agent', name: 'Model Agent', status: 'ACTIVE', createdAt: now, updatedAt: now } }); await c.agentVersion.create({ data: { id: 'agent-version', agentDefinitionId: 'agent', version: 1, runtimeProfile: 'READ_ONLY_WORK', status: 'ACTIVE', createdAt: now } }); await c.agentAssignment.create({ data: { id: 'agent-assignment', organizationId: 'org', agentDefinitionId: 'agent', scopeType: 'USER', scopeId: 'employee', status: 'ACTIVE', createdAt: now, updatedAt: now } }); }
async function headers(id = 'employee') { const raw = `token-${id}-${'x'.repeat(40)}`; await db().session.create({ data: { id: `session-${id}`, accountId: `account-${id}`, tokenHash: hashSessionToken(raw), createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000) } }); return { authorization: `Bearer ${raw}`, 'idempotency-key': 'request-key' }; }
const request = (headers:Record<string,string>, body:Record<string,unknown> = { agentId: 'agent', prompt: ' Recommend a plan ' }) => ({ method: 'POST' as const, url: '/tasks/task/agent-responses', headers, payload: body });

describe('Model runtime API', () => {
  beforeEach(clean); afterAll(async () => { if (database) await clean(); await database?.$disconnect(); });
  it('creates and idempotently reuses an authorized completed model invocation without changing work records', async () => {
    await fixture(); const fake = new FakeModelProvider(async () => ({ outputText: 'Suggestion', providerResponseId: 'provider-response', inputTokens: 1, outputTokens: 2, totalTokens: 3 })); const app = await createApp({ prisma: db(), modelProvider: fake }); const auth = await headers();
    const first = await app.inject(request(auth)); expect(first.statusCode).toBe(201); const second = await app.inject(request(auth)); expect(second.statusCode).toBe(200); expect(second.json().invocation.id).toBe(first.json().invocation.id); expect(fake.calls).toHaveLength(1); expect(fake.calls[0]?.instructions).toContain('Task title: Task'); expect(await db().agentRun.findUniqueOrThrow({ where: { id: first.json().invocation.agentRunId } })).toMatchObject({ kind: 'MODEL', status: 'SUCCEEDED' }); expect(await db().agentToolCall.count()).toBe(0); expect(await db().result.count()).toBe(0); expect(await db().artifact.count()).toBe(0); expect(await db().review.count()).toBe(0);
    expect((await app.inject({ method: 'GET', url: '/tasks/task/agent-responses?limit=1', headers: auth })).json().items).toHaveLength(1); await app.close();
  });
  it('returns 202 for an in-flight idempotent retry without another provider call', async () => {
    await fixture(); let resolve!: (value:ModelGeneration) => void; let started!: () => void; const pending = new Promise<ModelGeneration>(done => { resolve = done; }); const entered = new Promise<void>(done => { started = done; }); const fake = new FakeModelProvider(async () => { started(); return pending; }); const app = await createApp({ prisma: db(), modelProvider: fake }); const auth = await headers();
    const first = app.inject(request(auth)); await entered; const retry = await app.inject(request(auth)); expect(retry.statusCode).toBe(202); expect(fake.calls).toHaveLength(1); resolve({ outputText: 'Done' }); expect((await first).statusCode).toBe(201); await app.close();
  });
  it('executes one read-only tool and completes the MODEL run with final text', async () => {
    await fixture(); let step=0; const fake=new FakeModelProvider(async()=>++step===1?{kind:'tool_calls',calls:[{callId:'provider-call-1',name:'get_task_snapshot',argumentsJson:'{}'}],replayItems:[{type:'function_call',call_id:'provider-call-1',name:'get_task_snapshot',arguments:'{}'}]}:{kind:'final',outputText:'Grounded suggestion',providerResponseId:'final',replayItems:[]}); const app=await createApp({prisma:db(),modelProvider:fake});const auth=await headers();
    const response=await app.inject(request(auth));expect(response.statusCode).toBe(201);expect(fake.calls).toHaveLength(2);expect(await db().agentToolCall.findMany({where:{agentRunId:response.json().invocation.agentRunId}})).toMatchObject([{sequence:1,name:'get_task_snapshot',status:'SUCCEEDED',providerCallId:'provider-call-1'}]);expect(response.json().invocation.toolCalls).toEqual([expect.objectContaining({sequence:1,name:'get_task_snapshot',status:'SUCCEEDED'})]);await app.close();
  });
  it('coordinates concurrent HTTP requests with one provider invocation and one durable MODEL run', async () => {
    await fixture(); let release!: (value: ModelGeneration) => void; let entered!: () => void;
    const enteredProvider = new Promise<void>(resolve => { entered = resolve; }); const pending = new Promise<ModelGeneration>(resolve => { release = resolve; });
    const fake = new FakeModelProvider(async () => { entered(); return pending; }); const app = await createApp({ prisma: db(), modelProvider: fake }); const auth = await headers();
    const first = app.inject(request(auth)); await enteredProvider;
    const second = await app.inject(request(auth)); expect([200, 202]).toContain(second.statusCode); expect(fake.calls).toHaveLength(1);
    release({ outputText: 'Done', providerResponseId: 'single-provider-response' }); const created = await first;
    expect(created.statusCode).toBe(201); expect(await db().modelInvocation.count()).toBe(1); expect(await db().agentRun.count({ where: { kind: 'MODEL' } })).toBe(1);
    expect(await db().modelInvocation.findFirstOrThrow()).toMatchObject({ status: 'COMPLETED' }); expect(await db().agentRun.findFirstOrThrow({ where: { kind: 'MODEL' } })).toMatchObject({ status: 'SUCCEEDED' }); await app.close();
  });
  it('does not retry a provider after the production finalize transaction fails', async () => {
    await fixture(); const fake = new FakeModelProvider(async () => ({ outputText: 'Only once', providerResponseId: 'response' }));
    const prisma = finalizeFailurePrisma(); const app = await createApp({ prisma, modelProvider: fake }); const auth = await headers();
    const response = await app.inject(request(auth)); expect(response.statusCode).toBe(502); expect(response.json().error.code).toBe('MODEL_FINALIZE_FAILED'); expect(JSON.stringify(response.json())).not.toContain('forced finalize failure'); expect(fake.calls).toHaveLength(1);
    expect(await db().modelInvocation.findFirstOrThrow()).toMatchObject({ status: 'RUNNING' }); expect(await db().agentRun.findFirstOrThrow({ where: { kind: 'MODEL' } })).toMatchObject({ status: 'RUNNING' }); await app.close();
  });
  it('never calls the provider or persists a MODEL run for live authorization failures', async () => {
    const scenarios: Array<{ name: string; arrange: () => Promise<void>; identity?: 'employee' | 'outsider' }> = [
      { name: 'project nonmember', arrange: async () => {}, identity: 'outsider' },
      { name: 'inactive account', arrange: async () => { await db().account.update({ where: { id: 'account-employee' }, data: { status: 'DISABLED' } }); } },
      { name: 'inactive organization membership', arrange: async () => { await db().organizationMembership.update({ where: { id: 'employee-org' }, data: { status: 'DISABLED' } }); } },
      { name: 'missing assignment', arrange: async () => { await db().agentAssignment.deleteMany(); } },
      { name: 'disabled definition', arrange: async () => { await db().agentDefinition.update({ where: { id: 'agent' }, data: { status: 'DISABLED' } }); } },
      { name: 'disabled version', arrange: async () => { await db().agentVersion.update({ where: { id: 'agent-version' }, data: { status: 'DISABLED' } }); } },
      { name: 'AGENT EXECUTE deny', arrange: async () => { await db().permissionOverride.create({ data: { id: 'deny', organizationId: 'org', userId: 'employee', scopeType: 'ORGANIZATION', scopeId: 'org', resource: 'AGENT', action: 'EXECUTE', effect: 'DENY', createdAt: now, updatedAt: now } }); } }
    ];
    for (const scenario of scenarios) { await clean(); await fixture(); const fake = new FakeModelProvider(async () => ({ outputText: 'must not run' })); const app = await createApp({ prisma: db(), modelProvider: fake }); const auth = await headers(scenario.identity ?? 'employee'); await scenario.arrange(); const response = await app.inject(request({ ...auth, 'idempotency-key': `denied-${scenario.name}` })); expect([401, 403, 404], scenario.name).toContain(response.statusCode); expect(fake.calls, scenario.name).toHaveLength(0); expect(await db().modelInvocation.count(), scenario.name).toBe(0); expect(await db().agentRun.count({ where: { kind: 'MODEL' } }), scenario.name).toBe(0); await app.close(); }
  });
  it('returns an already persisted failed invocation without another provider call', async () => {
    await fixture(); const fake = new FakeModelProvider(async () => { throw new ModelProviderError('MODEL_PROVIDER_FAILED'); }); const app = await createApp({ prisma: db(), modelProvider: fake }); const auth = await headers();
    expect((await app.inject(request(auth))).statusCode).toBe(502); const retry = await app.inject(request(auth)); expect(retry.statusCode).toBe(200); expect(retry.json().invocation.status).toBe('FAILED'); expect(fake.calls).toHaveLength(1); await app.close();
  });
  it('maps unavailable and failed providers safely without unauthorized writes', async () => {
    await fixture(); const auth = await headers(); const unavailable = await createApp({ prisma: db() }); const previousKey = process.env.OPENAI_API_KEY; const previousModel = process.env.OPENAI_MODEL; delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL; expect((await unavailable.inject(request(auth))).statusCode).toBe(503); expect(await db().modelInvocation.count()).toBe(0); await unavailable.close(); if (previousKey) process.env.OPENAI_API_KEY = previousKey; if (previousModel) process.env.OPENAI_MODEL = previousModel;
    const rate = new FakeModelProvider(async () => { throw new ModelProviderError('MODEL_PROVIDER_RATE_LIMITED'); }); const app = await createApp({ prisma: db(), modelProvider: rate }); const response = await app.inject(request({ ...auth, 'idempotency-key': 'rate-key' })); expect(response.statusCode).toBe(429); expect(await db().modelInvocation.findFirstOrThrow()).toMatchObject({ status: 'FAILED', errorCode: 'MODEL_PROVIDER_RATE_LIMITED' }); await db().agentAssignment.deleteMany(); expect((await app.inject(request({ ...auth, 'idempotency-key': 'denied-key' }))).statusCode).toBe(403); expect(rate.calls).toHaveLength(1); await app.close();
  });
  it('rejects forged model fields and isolates list access', async () => {
    await fixture(); const fake = new FakeModelProvider(async () => ({ outputText: 'ok' })); const app = await createApp({ prisma: db(), modelProvider: fake }); const auth = await headers(); const forged = await app.inject(request(auth, { agentId: 'agent', prompt: 'x', model: 'forged', provider: 'forged', instructions: 'forged', tools: [], userId: 'outsider', organizationId: 'other-org', projectId: 'x', agentVersionId: 'x' })); expect(forged.statusCode).toBe(400); expect(fake.calls).toHaveLength(0); expect(await db().modelInvocation.count()).toBe(0); const outsider = await headers('outsider'); expect((await app.inject({ method: 'GET', url: '/tasks/task/agent-responses', headers: outsider })).statusCode).toBe(404); await app.close();
  });
});

function finalizeFailurePrisma() {
  const base = db();
  return new Proxy(base, { get(target, property, receiver) {
    if (property !== '$transaction') { const value = Reflect.get(target, property, receiver); return typeof value === 'function' ? value.bind(target) : value; }
    return async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => target.$transaction(async tx => callback(new Proxy(tx, { get(transactionTarget, transactionProperty, transactionReceiver) {
      if (transactionProperty !== 'agentRun') { const value = Reflect.get(transactionTarget, transactionProperty, transactionReceiver); return typeof value === 'function' ? value.bind(transactionTarget) : value; }
      return new Proxy(tx.agentRun, { get(delegate, delegateProperty, delegateReceiver) { if (delegateProperty === 'updateMany') return async () => { throw new Error('forced finalize failure'); }; const value = Reflect.get(delegate, delegateProperty, delegateReceiver); return typeof value === 'function' ? value.bind(delegate) : value; } });
    } })), options as never);
  } }) as typeof base;
}
