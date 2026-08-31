import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { createPrismaClient, encodePassword } from '../../packages/database/src/index.js';

const database = process.env.DATABASE_URL ? createPrismaClient(process.env.DATABASE_URL) : undefined;
const db = () => { if (!database) throw new Error('DATABASE_URL is required for API integration tests'); return database; };

async function createAccount(id = 'auth-user', login = 'employee@example.test', status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
  const now = new Date();
  await db().user.create({ data: { id, name: id, systemRole: 'EMPLOYEE', createdAt: now, updatedAt: now } });
  await db().account.create({ data: { id: `${id}-account`, userId: id, login, passwordHash: await encodePassword('DemoPassword!2026'), status, createdAt: now, updatedAt: now } });
}

describe('production session identity API', () => {
  beforeEach(async () => {
    await db().session.deleteMany(); await db().account.deleteMany(); await db().humanConfirmation.deleteMany(); await db().review.deleteMany(); await db().resultArtifact.deleteMany(); await db().result.deleteMany(); await db().artifact.deleteMany(); await db().agentToolCall.deleteMany(); await db().agentRun.deleteMany(); await db().taskDependency.deleteMany(); await db().taskAssignment.deleteMany(); await db().task.deleteMany(); await db().projectMember.deleteMany(); await db().project.deleteMany(); await db().departmentMembership.deleteMany(); await db().organizationMembership.deleteMany(); await db().department.deleteMany(); await db().organization.deleteMany(); await db().user.deleteMany();
  });
  afterAll(async () => database?.$disconnect());

  it('logs in, resolves /me, revokes only that session, and hides credential material', async () => {
    await createAccount(); const app = await createApp({ prisma: db() });
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { login: ' EMPLOYEE@EXAMPLE.TEST ', password: 'DemoPassword!2026' } });
    expect(login.statusCode).toBe(200); expect(login.json()).toMatchObject({ user: { id: 'auth-user' } });
    const token = login.json().token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); expect(JSON.stringify(login.json())).not.toContain('passwordHash');
    expect((await db().session.findFirstOrThrow()).tokenHash).not.toBe(token);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })).json()).toMatchObject({ id: 'auth-user' });
    expect((await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    await app.close();
  });

  it('returns one generic failure for wrong credentials and rejects unauthenticated mutations before they write', async () => {
    await createAccount(); const app = await createApp({ prisma: db() });
    const wrongLogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'missing@example.test', password: 'nope' } });
    const wrongPassword = await app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'employee@example.test', password: 'nope' } });
    expect(wrongLogin.statusCode).toBe(401); expect(wrongLogin.json()).toEqual(wrongPassword.json());
    expect((await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Forbidden' } })).statusCode).toBe(401);
    expect(await db().project.count()).toBe(0);
    await app.close();
  });

  it('rejects malformed, expired, revoked, and disabled identities on each protected request', async () => {
    await createAccount(); const app = await createApp({ prisma: db() });
    const login = (await app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'employee@example.test', password: 'DemoPassword!2026' } })).json();
    for (const authorization of [undefined, 'Bearer invalid', 'Basic nope']) expect((await app.inject({ method: 'GET', url: '/me', headers: authorization ? { authorization } : {} })).statusCode).toBe(401);
    await db().session.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${login.token}` } })).statusCode).toBe(401);
    const enabled = (await app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'employee@example.test', password: 'DemoPassword!2026' } })).json();
    await db().account.update({ where: { userId: 'auth-user' }, data: { status: 'DISABLED' } });
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${enabled.token}` } })).statusCode).toBe(401);
    await app.close();
  });

  it('creates independent concurrent sessions and revokes only the presented token', async () => {
    await createAccount(); const app = await createApp({ prisma: db() });
    const [left, right] = await Promise.all([app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'employee@example.test', password: 'DemoPassword!2026' } }), app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'employee@example.test', password: 'DemoPassword!2026' } })]);
    const leftToken = left.json().token as string; const rightToken = right.json().token as string;
    expect(leftToken).not.toBe(rightToken);
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${leftToken}` } });
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${leftToken}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${rightToken}` } })).statusCode).toBe(200);
    await app.close();
  });
  it('uses only the bearer session identity and isolates two authenticated users', async () => {
    await createAccount('auth-user', 'employee@example.test'); await createAccount('second-user', 'second@example.test');
    const app = await createApp({ prisma: db() });
    const first = (await app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'employee@example.test', password: 'DemoPassword!2026' } })).json().token as string;
    const second = (await app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'second@example.test', password: 'DemoPassword!2026' } })).json().token as string;
    const headers = { authorization: `Bearer ${first}`, 'x-user-id': 'second-user' };
    expect((await app.inject({ method: 'GET', url: '/me?userId=second-user', headers })).json()).toMatchObject({ id: 'auth-user' });
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${'z'.repeat(43)}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${first}`, 'x-user-id': 'second-user' }, query: { userId: 'second-user' } })).json()).toMatchObject({ id: 'auth-user' });
    expect((await app.inject({ method: 'POST', url: '/projects', headers: { authorization: `Bearer ${first}` }, payload: { name: 'Forged', userId: 'second-user' } })).statusCode).toBe(400);
    const created = await app.inject({ method: 'POST', url: '/projects', headers: { authorization: `Bearer ${first}` }, payload: { name: 'Private' } });
    expect(created.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: '/projects', headers: { authorization: `Bearer ${second}` } })).json()).toEqual({ projects: [] });
    expect((await app.inject({ method: 'POST', url: '/projects/project-x/tasks', payload: { title: 'Nope' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/tasks/project-x/results', headers: { 'idempotency-key': '00000000-0000-4000-8000-000000000014' }, payload: { artifactIds: ['x'] } })).statusCode).toBe(401);
    expect(await db().task.count()).toBe(0); expect(await db().result.count()).toBe(0);
    await app.close();
  });
});
