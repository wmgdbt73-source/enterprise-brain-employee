import type { UserSystemRole } from '@enterprise-brain/contracts';
import type { UserId } from '@enterprise-brain/domain';

export interface CurrentUser {
  readonly id: UserId;
  readonly name: string;
  readonly systemRole: UserSystemRole;
}

export interface RequestContext {
  readonly currentUser: CurrentUser;
}
