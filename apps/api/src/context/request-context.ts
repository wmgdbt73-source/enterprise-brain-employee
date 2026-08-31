import type { UserSystemRole, CurrentUserContract } from '@enterprise-brain/contracts';
import type { UserId } from '@enterprise-brain/domain';

export interface CurrentUser {
  readonly id: UserId;
  readonly name: string;
  readonly systemRole: UserSystemRole;
  readonly organization?: CurrentUserContract['organization'];
  readonly department?: CurrentUserContract['department'];
}

export interface RequestContext {
  readonly currentUser: CurrentUser;
}
