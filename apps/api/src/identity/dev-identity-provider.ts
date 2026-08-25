import { asUserId } from '@enterprise-brain/domain';
import type { CurrentUser } from '../context/request-context.js';
import type { IdentityProvider } from './identity-provider.js';

export class DevIdentityProvider implements IdentityProvider {
  private readonly currentUser: CurrentUser;

  constructor(user: Partial<Omit<CurrentUser, 'id'>> & { id?: string } = {}) {
    this.currentUser = {
      id: asUserId(user.id ?? 'dev-user'),
      name: user.name ?? 'Development Employee',
      systemRole: user.systemRole ?? 'EMPLOYEE'
    };
  }

  async getCurrentUser(): Promise<CurrentUser> {
    return this.currentUser;
  }
}
