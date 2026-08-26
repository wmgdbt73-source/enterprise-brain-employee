import type { LocalPermission } from '@enterprise-brain/contracts';
import { DomainError, requireNonBlank } from './errors.js';
import {
  asDeviceId,
  asProjectId,
  asUserId,
  asWorkspaceBindingId,
  type DeviceId,
  type ProjectId,
  type UserId,
  type WorkspaceBindingId
} from './ids.js';

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

export interface RehydrateWorkspaceBindingInput {
  id: string;
  userId: string;
  projectId: string;
  deviceId: string;
  localPath: string;
  permissions: readonly LocalPermission[];
  createdAt: string;
  updatedAt: string;
}

export function createWorkspaceBinding(
  input: CreateWorkspaceBindingInput,
  now: Date
): WorkspaceBinding {
  requireLocalReadOnly(input.permissions);

  return Object.freeze({
    ...input,
    localPath: requireNonBlank(input.localPath, 'localPath'),
    permissions: Object.freeze(['LOCAL_READ'] as const),
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });
}

/** Restores only validated metadata from the trusted device-local store. */
export function rehydrateWorkspaceBinding(
  input: RehydrateWorkspaceBindingInput
): WorkspaceBinding {
  requireLocalReadOnly(input.permissions);
  return Object.freeze({
    id: asWorkspaceBindingId(input.id),
    userId: asUserId(input.userId),
    projectId: asProjectId(input.projectId),
    deviceId: asDeviceId(input.deviceId),
    localPath: requireNonBlank(input.localPath, 'localPath'),
    permissions: Object.freeze(['LOCAL_READ'] as const),
    createdAt: parseTimestamp(input.createdAt, 'createdAt'),
    updatedAt: parseTimestamp(input.updatedAt, 'updatedAt')
  });
}

function requireLocalReadOnly(permissions: readonly LocalPermission[]): void {
  if (permissions.length !== 1 || permissions[0] !== 'LOCAL_READ') {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'WorkspaceBinding permissions must be LOCAL_READ only during Alpha',
      { field: 'permissions' }
    );
  }
}

function parseTimestamp(value: string, field: string): Date {
  const timestamp = new Date(value);
  if (
    typeof value !== 'string' ||
    Number.isNaN(timestamp.valueOf()) ||
    timestamp.toISOString() !== value
  ) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      `${field} must be a valid ISO timestamp`,
      { field }
    );
  }
  return timestamp;
}
