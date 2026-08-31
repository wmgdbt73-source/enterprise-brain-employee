import { randomUUID } from 'node:crypto';
import type { EffectivePermissionContract, PermissionAction, PermissionEffect, PermissionOverrideContract, PermissionResource, PermissionScopeType } from '@enterprise-brain/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';

export type PermissionDbClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$use' | '$extends' | '$transaction'>;
export type PermissionInput = { organizationId: string; userId: string; scopeType: PermissionScopeType; scopeId: string; resource: PermissionResource; action: PermissionAction; roleAllowed?: boolean };
type OverrideInput = Omit<PermissionInput, 'organizationId' | 'userId' | 'roleAllowed'> & { effect: PermissionEffect };

const supported = new Set<string>([
  'ORGANIZATION:VIEW', 'DEPARTMENT:VIEW', 'DEPARTMENT:MANAGE', 'DEPARTMENT:ASSIGN',
  'PERMISSION:VIEW', 'PERMISSION:MANAGE', 'RESULT:REVIEW'
]);
export function isSupportedPermission(resource: PermissionResource, action: PermissionAction): boolean { return supported.has(`${resource}:${action}`); }

export class PermissionRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async evaluate(input: PermissionInput): Promise<EffectivePermissionContract> { return evaluatePermission(this.prisma, input); }
  async listForAdmin(actorId: string, userId: string): Promise<PermissionOverrideContract[] | 'NOT_FOUND' | 'FORBIDDEN'> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await activeAdmin(tx, actorId); if (!actor) return 'NOT_FOUND'; if (actor === 'FORBIDDEN') return 'FORBIDDEN';
      if (!(await tx.organizationMembership.findFirst({ where: { organizationId: actor.organizationId, userId, status: 'ACTIVE' } }))) return 'NOT_FOUND';
      return (await tx.permissionOverride.findMany({ where: { organizationId: actor.organizationId, userId }, orderBy: { createdAt: 'asc' } })).map(toContract);
    }, { isolationLevel: 'RepeatableRead' });
  }
  async upsertForAdmin(actorId: string, userId: string, input: OverrideInput): Promise<PermissionOverrideContract | 'NOT_FOUND' | 'FORBIDDEN'> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await activeAdmin(tx, actorId); if (!actor) return 'NOT_FOUND'; if (actor === 'FORBIDDEN') return 'FORBIDDEN';
      if (!isSupportedPermission(input.resource, input.action)) return 'NOT_FOUND';
      if (!(await tx.organizationMembership.findFirst({ where: { organizationId: actor.organizationId, userId, status: 'ACTIVE' } }))) return 'NOT_FOUND';
      if (input.scopeType === 'ORGANIZATION' && input.scopeId !== actor.organizationId) return 'NOT_FOUND';
      if (input.scopeType === 'DEPARTMENT' && !(await tx.department.findFirst({ where: { id: input.scopeId, organizationId: actor.organizationId, status: 'ACTIVE' } }))) return 'NOT_FOUND';
      const now = new Date(); const row = await tx.permissionOverride.upsert({
        where: { organizationId_userId_scopeType_scopeId_resource_action: { organizationId: actor.organizationId, userId, scopeType: input.scopeType, scopeId: input.scopeId, resource: input.resource, action: input.action } },
        create: { id: randomUUID(), organizationId: actor.organizationId, userId, ...input, createdAt: now, updatedAt: now }, update: { effect: input.effect, updatedAt: now }
      }); return toContract(row);
    }, { isolationLevel: 'RepeatableRead' });
  }
  async removeForAdmin(actorId: string, userId: string, overrideId: string): Promise<boolean | 'NOT_FOUND' | 'FORBIDDEN'> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await activeAdmin(tx, actorId); if (!actor) return 'NOT_FOUND'; if (actor === 'FORBIDDEN') return 'FORBIDDEN';
      if (!(await tx.organizationMembership.findFirst({ where: { organizationId: actor.organizationId, userId, status: 'ACTIVE' } }))) return 'NOT_FOUND';
      const deleted = await tx.permissionOverride.deleteMany({ where: { id: overrideId, organizationId: actor.organizationId, userId } }); return deleted.count === 1 ? true : 'NOT_FOUND';
    }, { isolationLevel: 'RepeatableRead' });
  }
}

/** Reusable live evaluator. Sensitive mutations call this within their transaction. */
export async function evaluatePermission(db: PermissionDbClient, input: PermissionInput): Promise<EffectivePermissionContract> {
  const base = { resource: input.resource, action: input.action, scopeType: input.scopeType, scopeId: input.scopeId };
  if (!isSupportedPermission(input.resource, input.action)) return { ...base, allowed: false, source: 'DEFAULT_DENY' };
  const matchingScopes = input.scopeType === 'DEPARTMENT'
    ? [{ scopeType: 'DEPARTMENT' as const, scopeId: input.scopeId }, { scopeType: 'ORGANIZATION' as const, scopeId: input.organizationId }]
    : [{ scopeType: 'ORGANIZATION' as const, scopeId: input.organizationId }];
  const overrides = await db.permissionOverride.findMany({ where: { organizationId: input.organizationId, userId: input.userId, resource: input.resource, action: input.action, OR: matchingScopes } });
  if (overrides.some((row) => row.effect === 'DENY')) return { ...base, allowed: false, source: 'OVERRIDE_DENY' };
  if (overrides.some((row) => row.effect === 'ALLOW')) return { ...base, allowed: true, source: 'OVERRIDE_ALLOW' };
  const member = await db.organizationMembership.findFirst({ where: { organizationId: input.organizationId, userId: input.userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } }, include: { departmentMembership: true } });
  const orgAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN';
  const roleAllowed = input.resource === 'RESULT' && input.action === 'REVIEW'
    ? input.roleAllowed === true
    : orgAdmin
      ? (input.resource === 'ORGANIZATION' && input.action === 'VIEW') || (input.resource === 'DEPARTMENT' && ['VIEW', 'MANAGE', 'ASSIGN'].includes(input.action)) || (input.resource === 'PERMISSION' && ['VIEW', 'MANAGE'].includes(input.action))
      : member?.role === 'MEMBER' && ((input.resource === 'ORGANIZATION' && input.action === 'VIEW') || (input.resource === 'DEPARTMENT' && input.action === 'VIEW' && (input.scopeType === 'ORGANIZATION' || (member.departmentMembership?.status === 'ACTIVE' && member.departmentMembership.departmentId === input.scopeId))));
  return { ...base, allowed: roleAllowed, source: roleAllowed ? 'ROLE' : 'DEFAULT_DENY' };
}

async function activeAdmin(db: PermissionDbClient, userId: string): Promise<{ organizationId: string } | 'FORBIDDEN' | undefined> { const member = await db.organizationMembership.findFirst({ where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } } }); if (!member) return undefined; return member.role === 'OWNER' || member.role === 'ADMIN' ? { organizationId: member.organizationId } : 'FORBIDDEN'; }
function toContract(row: { id:string; organizationId:string; userId:string; scopeType: PermissionScopeType; scopeId:string; resource: PermissionResource; action: PermissionAction; effect: PermissionEffect; createdAt:Date; updatedAt:Date }): PermissionOverrideContract { return { id:row.id,organizationId:row.organizationId,userId:row.userId,scopeType:row.scopeType,scopeId:row.scopeId,resource:row.resource,action:row.action,effect:row.effect,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString() }; }
