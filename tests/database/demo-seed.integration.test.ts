import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPrismaClient } from '../../packages/database/src/index.js';

const execute = promisify(execFile);
const database = process.env.DATABASE_URL ? createPrismaClient(process.env.DATABASE_URL) : undefined;
const db = () => { if (!database) throw new Error('DATABASE_URL is required for database integration tests'); return database; };

describe('demo seed', () => {
  beforeEach(async () => {
    await db().session.deleteMany(); await db().account.deleteMany(); await db().humanConfirmation.deleteMany(); await db().review.deleteMany(); await db().resultArtifact.deleteMany(); await db().result.deleteMany(); await db().artifact.deleteMany(); await db().agentToolCall.deleteMany(); await db().agentRun.deleteMany(); await db().taskDependency.deleteMany(); await db().taskAssignment.deleteMany(); await db().task.deleteMany(); await db().projectMember.deleteMany(); await db().project.deleteMany(); await db().user.deleteMany();
  });
  afterAll(async () => database?.$disconnect());

  it('runs the package-owned command twice and creates one shared review-capable fixture', async () => {
    const environment = { ...process.env, DATABASE_URL: process.env.DATABASE_URL! };
    await execute('pnpm', ['--filter', '@enterprise-brain/database', 'seed:demo'], { cwd: process.cwd(), env: environment });
    await execute('pnpm', ['--filter', '@enterprise-brain/database', 'seed:demo'], { cwd: process.cwd(), env: environment });
    expect((await db().account.findMany({ orderBy: { login: 'asc' } })).map((account) => account.login)).toEqual(['admin@example.test', 'employee@example.test', 'reviewer@example.test']);
    const members = await db().projectMember.findMany({ where: { projectId: 'demo-review-project' }, orderBy: { userId: 'asc' } });
    expect(members.map((member) => [member.userId, member.role])).toEqual([['demo-employee', 'OWNER'], ['demo-reviewer', 'REVIEWER']]);
    expect(await db().project.count({ where: { id: 'demo-review-project' } })).toBe(1);
  });
});
