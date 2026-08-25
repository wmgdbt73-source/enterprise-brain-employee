import type { ProjectId, TaskId, UserId } from './ids.js';

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type TaskStatus =
  'TODO' | 'IN_PROGRESS' | 'READY_FOR_REVIEW' | 'ACCEPTED' | 'CLOSED';

export type TaskAction =
  | 'START'
  | 'SUBMIT_FOR_REVIEW'
  | 'REQUEST_REWORK'
  | 'ACCEPT_AFTER_HUMAN_REVIEW'
  | 'CLOSE';

export interface TaskContract {
  id: TaskId;
  projectId: ProjectId;
  title: string;
  description?: string;
  assigneeId?: UserId;
  priority: TaskPriority;
  status: TaskStatus;
  acceptanceCriteria: string[];
  dependencyIds: TaskId[];
  deadline?: string;
  createdAt: string;
  updatedAt: string;
}
