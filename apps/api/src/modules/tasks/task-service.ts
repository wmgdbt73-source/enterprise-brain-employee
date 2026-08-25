import { randomUUID } from 'node:crypto';
import type { TaskContract } from '@enterprise-brain/contracts';
import {
  applyTaskAction,
  asProjectId,
  asTaskId,
  asUserId,
  createTask,
  DomainError
} from '@enterprise-brain/domain';
import type { TaskRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';

export class TaskNotFoundError extends Error {}

export class TaskService {
  constructor(private readonly tasks: TaskRepository) {}

  async create(
    context: RequestContext,
    projectId: string,
    input: {
      title: string;
      description?: string;
      assigneeId?: string;
      priority?: 'P0' | 'P1' | 'P2' | 'P3';
      acceptanceCriteria?: string[];
      deadline?: string;
    }
  ): Promise<TaskContract> {
    const members = await this.tasks.projectMembersForMember(
      projectId,
      context.currentUser.id
    );
    if (!members) throw new TaskNotFoundError();
    const deadline = input.deadline ? new Date(input.deadline) : undefined;
    if (deadline && Number.isNaN(deadline.valueOf()))
      throw new DomainError(
        'INVALID_ARGUMENT',
        'deadline must be a valid ISO-8601 date-time'
      );
    const task = createTask(
      {
        id: asTaskId(randomUUID()),
        projectId: asProjectId(projectId),
        title: input.title,
        description: input.description,
        assigneeId: input.assigneeId ? asUserId(input.assigneeId) : undefined,
        priority: input.priority,
        acceptanceCriteria: input.acceptanceCriteria,
        dependencyIds: [],
        deadline
      },
      members,
      new Date()
    );
    return this.tasks.create(task);
  }

  async list(
    context: RequestContext,
    projectId: string
  ): Promise<TaskContract[]> {
    const tasks = await this.tasks.listByProjectForMember(
      projectId,
      context.currentUser.id
    );
    if (!tasks) throw new TaskNotFoundError();
    return tasks;
  }

  async get(context: RequestContext, taskId: string): Promise<TaskContract> {
    const task = await this.tasks.findByIdForMember(
      taskId,
      context.currentUser.id
    );
    if (!task) throw new TaskNotFoundError();
    return task;
  }

  async start(context: RequestContext, taskId: string): Promise<TaskContract> {
    const task = await this.tasks.loadDomainTaskForMember(
      taskId,
      context.currentUser.id
    );
    if (!task) throw new TaskNotFoundError();
    return this.tasks.persistTransition(
      applyTaskAction(task, 'START', new Date())
    );
  }
}
