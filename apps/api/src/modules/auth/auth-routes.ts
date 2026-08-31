import type { FastifyInstance } from 'fastify';
import type { LoginResponse } from '@enterprise-brain/contracts';
import { SessionRepository } from '@enterprise-brain/database';

const loginSchema = {
  type: 'object', additionalProperties: false, required: ['login', 'password'],
  properties: { login: { type: 'string', minLength: 1, maxLength: 320 }, password: { type: 'string', minLength: 1, maxLength: 1024 } }
} as const;

export class InvalidCredentialsError extends Error {}

export function registerAuthRoutes(app: FastifyInstance, sessions: SessionRepository): void {
  app.post<{ Body: { login: string; password: string } }>('/auth/login', { schema: { body: loginSchema } }, async (request): Promise<LoginResponse> => {
    const authenticated = await sessions.login(request.body.login, request.body.password);
    if (!authenticated) throw new InvalidCredentialsError('Invalid login credentials');
    return authenticated;
  });
  app.post('/auth/logout', async (request) => {
    await sessions.logoutBearer(request.headers.authorization);
    return { revoked: true };
  });
}
