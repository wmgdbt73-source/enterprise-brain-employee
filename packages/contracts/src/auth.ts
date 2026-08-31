import type { CurrentUserContract } from './user.js';

export type AccountStatus = 'ACTIVE' | 'DISABLED';

export interface LoginRequest {
  login: string;
  password: string;
}

/** The bearer token is intentionally returned only by the authenticated API. */
export interface LoginResponse {
  token: string;
  user: CurrentUserContract;
}
