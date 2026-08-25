import type { TaskContract } from '@enterprise-brain/contracts';
import {
  asProjectId,
  asProjectMemberId,
  asTaskId,
  asUserId,
  createProjectMember,
  rehydrateTask,
  type ProjectMember,
  type Task,
  type UserId
} from '@enterprise-brain/domain';
import type { PrismaClient } from '../generated/prisma/client.js';

export class TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async projectMembersForMember(
    projectId: string,
    userId: UserId
  ): Promise<ProjectMember[] | undefined> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, members: { some: { userId } } },
      include: { members: true }
    });
    if (!project) return undefined;
    return project.members.map((member) =>
      createProjectMember(
        {
          id: asProjectMemberId(member.id),
          projectId: asProjectId(member.projectId),
          userId: asUserId(member.userId),
          role: member.role
        },
        member.createdAt
      )
    );
  }

  async create(task: Task): Promise<TaskContract> {
    const record = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.task.create({
        data: {
          id: task.id,
          projectId: task.projectId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
          acceptanceCriteria: [...task.acceptanceCriteria],
          deadline: task.deadline,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        }
      });
      if (task.assigneeId) {
        await transaction.taskAssignment.create({
          data: {
            taskId: task.id,
            projectId: task.projectId,
            userId: task.assigneeId
          }
        });
      }
      return created;
    });
    return toTaskContract(record, task.assigneeId);
  }

  async listByProjectForMember(
    projectId: string,
    userId: UserId
  ): Promise<TaskContract[] | undefined> {
    const access = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });
    if (!access) return undefined;
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: { assignment: true },
      orderBy: { createdAt: 'desc' }
    });
    return tasks.map((task) => toTaskContract(task, task.assignment?.userId));
  }

  async findByIdForMember(
    taskId: string,
    userId: UserId
  ): Promise<TaskContract | undefined> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { members: { some: { userId } } } },
      include: { assignment: true }
    });
    return task ? toTaskContract(task, task.assignment?.userId) : undefined;
  }

  async loadDomainTaskForMember(
    taskId: string,
    userId: UserId
  ): Promise<Task | undefined> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { members: { some: { userId } } } },
      include: { assignment: true, dependencies: true }
    });
    if (!task) return undefined;
    return rehydrateTask({
      id: asTaskId(task.id),
      projectId: asProjectId(task.projectId),
      title: task.title,
      description: task.description ?? undefined,
      assigneeId: task.assignment
        ? asUserId(task.assignment.userId)
        : undefined,
      priority: task.priority,
      status: task.status,
      acceptanceCriteria: task.acceptanceCriteria,
      dependencyIds: task.dependencies.map((dependency) =>
        asTaskId(dependency.dependsOnTaskId)
      ),
      deadline: task.deadline ?? undefined,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    });
  }

  async persistTransition(task: Task): Promise<TaskContract> {
    const record = await this.prisma.task.update({
      where: { id: task.id },
      data: { status: task.status, updatedAt: task.updatedAt }
    });
    return toTaskContract(record, task.assigneeId);
  }
}

function toTaskContract(
  task: {
    id: string;
    projectId: string;
    title: string;
    description: string | null;
    priority: TaskContract['priority'];
    status: TaskContract['status'];
    acceptanceCriteria: string[];
    deadline: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  assigneeId?: string
): TaskContract {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    ...(assigneeId ? { assigneeId } : {}),
    priority: task.priority,
    status: task.status,
    acceptanceCriteria: task.acceptanceCriteria,
    dependencyIds: [],
    ...(task.deadline ? { deadline: task.deadline.toISOString() } : {}),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}
