declare const userIdBrand: unique symbol;
declare const projectIdBrand: unique symbol;
declare const projectMemberIdBrand: unique symbol;
declare const taskIdBrand: unique symbol;
declare const workspaceBindingIdBrand: unique symbol;
declare const deviceIdBrand: unique symbol;
declare const agentRunIdBrand: unique symbol;
declare const agentToolCallIdBrand: unique symbol;
declare const artifactIdBrand: unique symbol;
declare const resultIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: 'UserId' };
export type ProjectId = string & { readonly [projectIdBrand]: 'ProjectId' };
export type ProjectMemberId = string & {
  readonly [projectMemberIdBrand]: 'ProjectMemberId';
};
export type TaskId = string & { readonly [taskIdBrand]: 'TaskId' };
export type WorkspaceBindingId = string & {
  readonly [workspaceBindingIdBrand]: 'WorkspaceBindingId';
};
export type DeviceId = string & { readonly [deviceIdBrand]: 'DeviceId' };
export type AgentRunId = string & { readonly [agentRunIdBrand]: 'AgentRunId' };
export type AgentToolCallId = string & {
  readonly [agentToolCallIdBrand]: 'AgentToolCallId';
};
export type ArtifactId = string & { readonly [artifactIdBrand]: 'ArtifactId' };
export type ResultId = string & { readonly [resultIdBrand]: 'ResultId' };

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

export function asWorkspaceBindingId(value: string): WorkspaceBindingId {
  return asNonEmptyId<WorkspaceBindingId>(value, 'WorkspaceBindingId');
}

export function asDeviceId(value: string): DeviceId {
  return asNonEmptyId<DeviceId>(value, 'DeviceId');
}
export function asAgentRunId(value: string): AgentRunId {
  return asNonEmptyId<AgentRunId>(value, 'AgentRunId');
}
export function asAgentToolCallId(value: string): AgentToolCallId {
  return asNonEmptyId<AgentToolCallId>(value, 'AgentToolCallId');
}
export function asArtifactId(value: string): ArtifactId {
  return asNonEmptyId<ArtifactId>(value, 'ArtifactId');
}
export function asResultId(value: string): ResultId { return asNonEmptyId<ResultId>(value, 'ResultId'); }
import { DomainError } from './errors.js';
