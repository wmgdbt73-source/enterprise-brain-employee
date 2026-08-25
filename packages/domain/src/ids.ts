declare const userIdBrand: unique symbol;
declare const projectIdBrand: unique symbol;
declare const projectMemberIdBrand: unique symbol;
declare const taskIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: 'UserId' };
export type ProjectId = string & { readonly [projectIdBrand]: 'ProjectId' };
export type ProjectMemberId = string & {
  readonly [projectMemberIdBrand]: 'ProjectMemberId';
};
export type TaskId = string & { readonly [taskIdBrand]: 'TaskId' };

function asNonEmptyId<T extends string>(value: string, label: string): T {
  if (value.trim().length === 0) {
    throw new DomainError('INVALID_ARGUMENT', `${label} must not be empty`, {
      field: label
    });
  }

  return value as T;
}

export function asUserId(value: string): UserId {
  return asNonEmptyId<UserId>(value, 'UserId');
}

export function asProjectId(value: string): ProjectId {
  return asNonEmptyId<ProjectId>(value, 'ProjectId');
}

export function asProjectMemberId(value: string): ProjectMemberId {
  return asNonEmptyId<ProjectMemberId>(value, 'ProjectMemberId');
}

export function asTaskId(value: string): TaskId {
  return asNonEmptyId<TaskId>(value, 'TaskId');
}
import { DomainError } from './errors.js';
