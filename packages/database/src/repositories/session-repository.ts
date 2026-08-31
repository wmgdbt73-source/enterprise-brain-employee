import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { CurrentUserContract } from '@enterprise-brain/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { normalizeLogin, verifyPassword } from '../auth/password.js';

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export class SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async login(loginInput: string, password: string, now = new Date()): Promise<{ token: string; user: CurrentUserContract } | undefined> {
    const login = normalizeLogin(loginInput);
    if (!login) return undefined;
    const account = await this.prisma.account.findUnique({ where: { login }, include: { user: { include: userInclude } } });
    if (!account || account.status !== 'ACTIVE' || !(await verifyPassword(password, account.passwordHash))) return undefined;
    const token = createSessionToken();
    await this.prisma.session.create({
      data: { id: randomUUID(), accountId: account.id, tokenHash: hashSessionToken(token), createdAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) }
    });
    return { token, user: toCurrentUser(account.user) };
  }

  async resolveBearer(value: string | undefined, now = new Date()): Promise<CurrentUserContract | undefined> {
    const token = parseBearer(value);
    if (!token) return undefined;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: { account: { include: { user: { include: userInclude } } } } });
    if (!session || session.revokedAt || session.expiresAt <= now || session.account.status !== 'ACTIVE') return undefined;
    return toCurrentUser(session.account.user);
  }

  async logoutBearer(value: string | undefined, now = new Date()): Promise<boolean> {
    const token = parseBearer(value);
    if (!token) return false;
    const updated = await this.prisma.session.updateMany({ where: { tokenHash: hashSessionToken(token), revokedAt: null }, data: { revokedAt: now } });
    return updated.count === 1;
  }
}

export function parseBearer(value: string | undefined): string | undefined {
  if (!value || !/^Bearer [A-Za-z0-9_-]{40,}$/.test(value)) return undefined;
  return value.slice(7);
}

const userInclude = {
  organizationMembership: { include: { organization: true, departmentMembership: { include: { department: true } } } }
} satisfies Prisma.UserInclude;

function toCurrentUser(user: {
  id: string; name: string; systemRole: 'EMPLOYEE' | 'ADMIN';
  organizationMembership?: { role: 'OWNER' | 'ADMIN' | 'MEMBER'; status: 'ACTIVE' | 'DISABLED'; organization: { id: string; name: string; status: 'ACTIVE' | 'DISABLED' }; departmentMembership?: { role: 'MANAGER' | 'MEMBER'; status: 'ACTIVE' | 'DISABLED'; department: { id: string; name: string; status: 'ACTIVE' | 'DISABLED' } } | null } | null;
}): CurrentUserContract {
  const membership = user.organizationMembership;
  const active = membership?.status === 'ACTIVE' && membership.organization.status === 'ACTIVE';
  const department = active && membership.departmentMembership?.status === 'ACTIVE' && membership.departmentMembership.department.status === 'ACTIVE'
    ? { id: membership.departmentMembership.department.id, name: membership.departmentMembership.department.name, role: membership.departmentMembership.role }
    : undefined;
  return { id: user.id as CurrentUserContract['id'], name: user.name, systemRole: user.systemRole, organization: active ? { id: membership.organization.id, name: membership.organization.name, role: membership.role } : undefined, department };
}
