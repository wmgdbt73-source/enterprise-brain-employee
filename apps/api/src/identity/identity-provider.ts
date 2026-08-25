import type { CurrentUser } from '../context/request-context.js';

export interface IdentityProvider {
  getCurrentUser(): Promise<CurrentUser>;
}
