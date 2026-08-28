import type { ResultContract } from '@enterprise-brain/contracts';
import { applyTaskAction, asArtifactId, asProjectId, asResultId, asTaskId, asUserId, createResult, rehydrateTask, submitResultForReview } from '@enterprise-brain/domain';
import type { PrismaClient } from '../generated/prisma/client.js';
type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;
export type ResultLookup = ResultContract | 'NOT_FOUND';
export class ResultRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async createForMember(input: { id: string; taskId: string; userId: string; artifactIds: string[]; now: Date }): Promise<ResultLookup> {
    return this.prisma.$transaction(tx => this.create(tx, input));
  }
  private async create(tx: Tx, input: { id: string; taskId: string; userId: string; artifactIds: string[]; now: Date }): Promise<ResultLookup> {
    const task = await tx.task.findFirst({ where: { id: input.taskId, project: { members: { some: { userId: input.userId } } } } });
    if (!task) return 'NOT_FOUND';
    const artifacts = await tx.artifact.findMany({ where: { id: { in: input.artifactIds }, taskId: task.id } });
    if (artifacts.length !== input.artifactIds.length) return 'NOT_FOUND';
    const result = createResult({ id: asResultId(input.id), taskId: asTaskId(task.id), artifactIds: input.artifactIds.map(asArtifactId), submittedBy: asUserId(input.userId), createdAt: input.now, updatedAt: input.now });
    const created = await tx.result.create({ data: { id: result.id, taskId: task.id, projectId: task.projectId, status: result.status, submittedBy: result.submittedBy, createdAt: result.createdAt, updatedAt: result.updatedAt, artifacts: { create: input.artifactIds.map(artifactId => ({ artifactId })) } }, include: { artifacts: true } });
    return toContract(created);
  }
  async getForMember(id: string, userId: string): Promise<ResultLookup> { const row = await this.prisma.result.findFirst({ where: { id, task: { project: { members: { some: { userId } } } } }, include: { artifacts: true } }); return row ? toContract(row) : 'NOT_FOUND'; }
  async listForTaskForMember(taskId: string, userId: string): Promise<ResultContract[] | undefined> { const task = await this.prisma.task.findFirst({ where: { id: taskId, project: { members: { some: { userId } } } } }); if (!task) return undefined; const rows = await this.prisma.result.findMany({ where: { taskId }, include: { artifacts: true }, orderBy: { createdAt: 'desc' } }); return rows.map(toContract); }
  async submitForReviewForMember(id: string, userId: string, now: Date): Promise<ResultLookup | 'INVALID_STATE'> {
    return this.prisma.$transaction(async tx => {
      const row = await tx.result.findFirst({
        where: { id, submittedBy: userId, task: { project: { members: { some: { userId } } } } },
        include: { artifacts: true, task: { include: { assignment: true, dependencies: true } } }
      });
      if (!row) return 'NOT_FOUND';
      let result; let submittedTask;
      try {
        result = submitResultForReview({ id: asResultId(row.id), taskId: asTaskId(row.taskId), artifactIds: row.artifacts.map(link => asArtifactId(link.artifactId)), status: row.status, submittedBy: asUserId(row.submittedBy), createdAt: row.createdAt, submittedAt: row.submittedAt ?? undefined, updatedAt: row.updatedAt }, now);
        const task = rehydrateTask({ id: asTaskId(row.task.id), projectId: asProjectId(row.task.projectId), title: row.task.title, description: row.task.description ?? undefined, assigneeId: row.task.assignment ? asUserId(row.task.assignment.userId) : undefined, priority: row.task.priority, status: row.task.status, acceptanceCriteria: row.task.acceptanceCriteria, dependencyIds: row.task.dependencies.map(d => asTaskId(d.dependsOnTaskId)), deadline: row.task.deadline ?? undefined, createdAt: row.task.createdAt, updatedAt: row.task.updatedAt });
        submittedTask = applyTaskAction(task, 'SUBMIT_FOR_REVIEW', now);
      } catch { return 'INVALID_STATE'; }
      const updated = await tx.result.update({ where: { id: row.id }, data: { status: result.status, submittedAt: result.submittedAt, updatedAt: result.updatedAt }, include: { artifacts: true } });
      await tx.task.update({ where: { id: submittedTask.id }, data: { status: submittedTask.status, updatedAt: submittedTask.updatedAt } });
      return toContract(updated);
    });
  }
}
function toContract(row: { id: string; taskId: string; status: ResultContract['status']; submittedBy: string; createdAt: Date; submittedAt: Date | null; updatedAt: Date; artifacts: { artifactId: string }[] }): ResultContract { return { id: row.id, taskId: row.taskId, artifactIds: row.artifacts.map(link => link.artifactId), status: row.status, submittedBy: row.submittedBy, createdAt: row.createdAt.toISOString(), ...(row.submittedAt ? { submittedAt: row.submittedAt.toISOString() } : {}), updatedAt: row.updatedAt.toISOString() }; }
