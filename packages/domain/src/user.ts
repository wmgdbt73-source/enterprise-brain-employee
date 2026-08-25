import type { UserSystemRole } from '@enterprise-brain/contracts';
import { DomainError, requireNonBlank } from './errors.js';
import type { UserId } from './ids.js';

export interface User {
  readonly id: UserId;
  readonly name: string;
  readonly systemRole: UserSystemRole;
  readonly departmentId?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserInput {
  id: UserId;
  name: string;
  systemRole: UserSystemRole;
  departmentId?: string;
}

const userSystemRoles = new Set<UserSystemRole>(['EMPLOYEE', 'ADMIN']);

export function createUser(input: CreateUserInput, now: Date): User {
  if (!userSystemRoles.has(input.systemRole)) {
    throw new DomainError('INVALID_ARGUMENT', 'Unsupported UserSystemRole');
  }

  return Object.freeze({
    id: input.id,
    name: requireNonBlank(input.name, 'name'),
    systemRole: input.systemRole,
    departmentId: input.departmentId?.trim() || undefined,
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });
}
