import type { LocalPermission } from '@enterprise-brain/contracts';
import { DomainError, requireNonBlank } from './errors.js';
import type { DeviceId, ProjectId, UserId, WorkspaceBindingId } from './ids.js';

export interface WorkspaceBinding {
  readonly id: WorkspaceBindingId;
  readonly userId: UserId;
  readonly projectId: ProjectId;
  readonly deviceId: DeviceId;
  readonly localPath: string;
  readonly permissions: readonly LocalPermission[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateWorkspaceBindingInput {
  id: WorkspaceBindingId;
  userId: UserId;
  projectId: ProjectId;
  deviceId: DeviceId;
  localPath: string;
  permissions: readonly LocalPermission[];
}

export function createWorkspaceBinding(
  input: CreateWorkspaceBindingInput,
  now: Date
): WorkspaceBinding {
  if (input.permissions.length !== 1 || input.permissions[0] !== 'LOCAL_READ') {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'WorkspaceBinding permissions must be LOCAL_READ only during Alpha',
      { field: 'permissions' }
    );
  }

  return Object.freeze({
    ...input,
    localPath: requireNonBlank(input.localPath, 'localPath'),
    permissions: Object.freeze(['LOCAL_READ'] as const),
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });
}
