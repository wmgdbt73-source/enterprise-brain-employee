import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { DevIdentityProvider } from '../../apps/api/src/identity/dev-identity-provider.js';
import { createPrismaClient } from '../../packages/database/src/index.js';
const database = process.env.DATABASE_URL ? createPrismaClient(process.env.DATABASE_URL) : undefined;
const db = () => { if (!database) throw new Error('DATABASE_URL is required'); return database; };
async function reset() { const d = db(); await d.resultArtifact.deleteMany(); await d.result.deleteMany(); await d.humanConfirmation.deleteMany(); await d.artifact.deleteMany(); await d.agentToolCall.deleteMany(); await d.agentRun.deleteMany(); await d.taskDependency.deleteMany(); await d.taskAssignment.deleteMany(); await d.task.deleteMany(); await d.projectMember.deleteMany(); await d.project.deleteMany(); await d.user.deleteMany(); }
async function fixture() {
  const app = await createApp({ prisma: db() });
  const project = (await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Result project' } })).json();
  const task = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Deliver' } })).json();
  await app.inject({ method: 'POST', url: `/tasks/${task.id}/start` });
  const now = new Date();
  await db().agentRun.create({ data: { id: 'result-run', userId: 'dev-user', projectId: project.id, taskId: task.id, agentDefinitionKey: 'read-only-work-agent-v1', intent: { name: 'read_file', relativePath: 'brief.md' }, status: 'SUCCEEDED', createdAt: now, startedAt: now, finishedAt: now, updatedAt: now } });
  await db().agentToolCall.create({ data: { id: 'result-call', agentRunId: 'result-run', sequence: 1, name: 'read_file', request: { id: 'result-call', runId: 'result-run', userId: 'dev-user', projectId: project.id, name: 'read_file', relativePath: 'brief.md' }, status: 'SUCCEEDED', receipt: { toolCallId: 'result-call', status: 'SUCCEEDED', metadata: { relativePath: 'brief.md', size: 1, encoding: 'utf-8', sha256: 'a'.repeat(64) } }, createdAt: now, completedAt: now } });
  await db().artifact.create({ data: { id: 'result-artifact', projectId: project.id, taskId: task.id, agentRunId: 'result-run', sourceToolCallId: 'result-call', type: 'FILE', storageKind: 'LOCAL_WORKSPACE', relativePath: 'brief.md', size: 1, encoding: 'utf-8', sha256: 'a'.repeat(64), version: 1, createdByUserId: 'dev-user', createdAt: now } });
  return { app, project, task, artifactId: 'result-artifact' };
}
describe('Result API vertical slice', () => {
  beforeEach(reset); afterAll(async () => database?.$disconnect());
  it('creates, lists, reads and submits a candidate atomically', async () => {
    const { app, task, artifactId } = await fixture();
    const created = await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, payload: { artifactIds: [artifactId] } });
    expect(created.statusCode).toBe(201); const result = created.json();
    expect(result).toMatchObject({ status: 'CANDIDATE', taskId: task.id, submittedBy: 'dev-user', artifactIds: [artifactId] });
    expect((await app.inject({ method: 'GET', url: `/results/${result.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/tasks/${task.id}/results` })).json()).toMatchObject({ results: [expect.objectContaining({ id: result.id })] });
    expect((await app.inject({ method: 'POST', url: `/results/${result.id}/submit-review` })).json()).toMatchObject({ status: 'HUMAN_REVIEW' });
    expect((await app.inject({ method: 'GET', url: `/tasks/${task.id}` })).json()).toMatchObject({ status: 'READY_FOR_REVIEW' });
    expect((await app.inject({ method: 'POST', url: `/results/${result.id}/submit-review` })).statusCode).toBe(409);
    await app.close();
  });
  it('rejects invalid artifacts and hides Result resources from non-members', async () => {
    const { app, task, artifactId } = await fixture();
    for (const artifactIds of [[], [artifactId, artifactId], ['missing']]) expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, payload: { artifactIds } })).statusCode).toBe(artifactIds.length === 0 || artifactIds.length === 2 ? 400 : 404);
    const result = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, payload: { artifactIds: [artifactId] } })).json();
    const outsider = await createApp({ prisma: db(), identityProvider: new DevIdentityProvider({ id: 'outsider' }) });
    expect((await outsider.inject({ method: 'GET', url: `/results/${result.id}` })).statusCode).toBe(404);
    expect((await outsider.inject({ method: 'GET', url: `/tasks/${task.id}/results` })).statusCode).toBe(404);
    expect((await outsider.inject({ method: 'POST', url: `/tasks/${task.id}/results`, payload: { artifactIds: [artifactId] } })).statusCode).toBe(404);
    await outsider.close(); await app.close();
  });
  it('hides a cross-task Artifact and creates no Result', async () => {
    const { app, project, task } = await fixture();
    const otherTask = (await app.inject({ method: 'POST', url: `/projects/${project.id}/tasks`, payload: { title: 'Other task' } })).json();
    const now = new Date();
    await db().agentRun.create({ data: { id: 'other-run', userId: 'dev-user', projectId: project.id, taskId: otherTask.id, agentDefinitionKey: 'read-only-work-agent-v1', intent: { name: 'read_file', relativePath: 'other.md' }, status: 'SUCCEEDED', createdAt: now, startedAt: now, finishedAt: now, updatedAt: now } });
    await db().agentToolCall.create({ data: { id: 'other-call', agentRunId: 'other-run', sequence: 1, name: 'read_file', request: { id: 'other-call', runId: 'other-run', userId: 'dev-user', projectId: project.id, name: 'read_file', relativePath: 'other.md' }, status: 'SUCCEEDED', receipt: { toolCallId: 'other-call', status: 'SUCCEEDED', metadata: { relativePath: 'other.md', size: 1, encoding: 'utf-8', sha256: 'b'.repeat(64) } }, createdAt: now, completedAt: now } });
    await db().artifact.create({ data: { id: 'other-artifact', projectId: project.id, taskId: otherTask.id, agentRunId: 'other-run', sourceToolCallId: 'other-call', type: 'FILE', storageKind: 'LOCAL_WORKSPACE', relativePath: 'other.md', size: 1, encoding: 'utf-8', sha256: 'b'.repeat(64), version: 1, createdByUserId: 'dev-user', createdAt: now } });
    expect((await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, payload: { artifactIds: ['other-artifact'] } })).statusCode).toBe(404);
    expect(await db().result.count()).toBe(0);
    await app.close();
  });
  it('rolls back Result submission when the Task state is invalid', async () => {
    const { app, task, artifactId } = await fixture();
    const result = (await app.inject({ method: 'POST', url: `/tasks/${task.id}/results`, payload: { artifactIds: [artifactId] } })).json();
    await db().task.update({ where: { id: task.id }, data: { status: 'TODO' } });
    const response = await app.inject({ method: 'POST', url: `/results/${result.id}/submit-review` });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_STATE_TRANSITION' } });
    expect(await db().result.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ status: 'CANDIDATE' });
    expect(await db().task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: 'TODO' });
    await app.close();
  });
});
