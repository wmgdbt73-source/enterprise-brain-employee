import type { UserId } from './ids.js';

export type UserSystemRole = 'EMPLOYEE' | 'ADMIN';

export interface UserContract {
  id: UserId;
  name: string;
  systemRole: UserSystemRole;
  departmentId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Current request identity; intentionally excludes persistence timestamps. */
export interface CurrentUserContract {
  id: UserId;
  name: string;
  systemRole: UserSystemRole;
}
