import type {
  TaskAction,
  TaskPriority,
  TaskStatus
} from '@enterprise-brain/contracts';
import { DomainError, requireNonBlank } from './errors.js';
import type { ProjectId, TaskId, UserId } from './ids.js';
import { isProjectMember, type ProjectMember } from './project-member.js';
import { transitionTaskStatus } from './task-state-machine.js';

export interface Task {
  readonly id: TaskId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly description?: string;
  readonly assigneeId?: UserId;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly acceptanceCriteria: readonly string[];
  readonly dependencyIds: readonly TaskId[];
  readonly deadline?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateTaskInput {
  id: TaskId;
  projectId: ProjectId;
  title: string;
  description?: string;
  assigneeId?: UserId;
  priority?: TaskPriority;
  acceptanceCriteria?: readonly string[];
  dependencyIds?: readonly TaskId[];
  deadline?: Date;
}

const taskPriorities = new Set<TaskPriority>(['P0', 'P1', 'P2', 'P3']);

export function createTask(
  input: CreateTaskInput,
  projectMembers: readonly ProjectMember[],
  now: Date
): Task {
  const priority = input.priority ?? 'P2';
  if (!taskPriorities.has(priority)) {
    throw new DomainError('INVALID_ARGUMENT', 'Unsupported TaskPriority');
  }

  assertAssigneeMembership(input.projectId, input.assigneeId, projectMembers);

  return Object.freeze({
    id: input.id,
    projectId: input.projectId,
    title: requireNonBlank(input.title, 'title'),
    description: input.description?.trim() || undefined,
    assigneeId: input.assigneeId,
    priority,
    status: 'TODO' as const,
    acceptanceCriteria: Object.freeze([...(input.acceptanceCriteria ?? [])]),
    dependencyIds: Object.freeze([...(input.dependencyIds ?? [])]),
    deadline: input.deadline ? new Date(input.deadline) : undefined,
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });
}

export function assignTask(
  task: Task,
  assigneeId: UserId,
  projectMembers: readonly ProjectMember[],
  now: Date
): Task {
  assertAssigneeMembership(task.projectId, assigneeId, projectMembers);

  return Object.freeze({ ...task, assigneeId, updatedAt: new Date(now) });
}

export function unassignTask(task: Task, now: Date): Task {
  return Object.freeze({
    ...task,
    assigneeId: undefined,
    updatedAt: new Date(now)
  });
}

export function applyTaskAction(
  task: Task,
  action: TaskAction,
  now: Date
): Task {
  return Object.freeze({
    ...task,
    status: transitionTaskStatus(task.status, action),
    updatedAt: new Date(now)
  });
}

function assertAssigneeMembership(
  projectId: ProjectId,
  assigneeId: UserId | undefined,
  projectMembers: readonly ProjectMember[]
): void {
  if (assigneeId && !isProjectMember(projectMembers, projectId, assigneeId)) {
    throw new DomainError(
      'PROJECT_MEMBERSHIP_REQUIRED',
      'Task assignee must be a member of the task project',
      { projectId, userId: assigneeId }
    );
  }
}
