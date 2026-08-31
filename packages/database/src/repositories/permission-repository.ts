import { randomUUID } from 'node:crypto';
import type { EffectivePermissionContract, PermissionAction, PermissionEffect, PermissionOverrideContract, PermissionResource, PermissionScopeType } from '@enterprise-brain/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';

type PermissionInput = { organizationId: string; userId: string; scopeType: PermissionScopeType; scopeId: string; resource: PermissionResource; action: PermissionAction };
export class PermissionRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async evaluate(input: PermissionInput): Promise<EffectivePermissionContract> { return evaluateWithClient(this.prisma, input); }
  async listForAdmin(actorId: string, userId: string): Promise<PermissionOverrideContract[] | 'NOT_FOUND' | 'FORBIDDEN'> {
    const actor = await activeAdmin(this.prisma, actorId); if (!actor) return 'NOT_FOUND'; if (actor === 'FORBIDDEN') return 'FORBIDDEN';
    const target = await this.prisma.organizationMembership.findFirst({ where: { organizationId: actor.organizationId, userId } }); if (!target) return 'NOT_FOUND';
    return (await this.prisma.permissionOverride.findMany({ where: { organizationId: actor.organizationId, userId }, orderBy: { createdAt: 'asc' } })).map(toContract);
  }
  async upsertForAdmin(actorId: string, userId: string, input: Omit<PermissionInput, 'organizationId' | 'userId'> & { effect: PermissionEffect }): Promise<PermissionOverrideContract | 'NOT_FOUND' | 'FORBIDDEN'> {
    return this.prisma.$transaction(async tx => {
      const actor = await activeAdmin(tx as PrismaClient, actorId); if (!actor) return 'NOT_FOUND'; if (actor === 'FORBIDDEN') return 'FORBIDDEN';
      const target = await tx.organizationMembership.findFirst({ where: { organizationId: actor.organizationId, userId } }); if (!target) return 'NOT_FOUND';
      if (input.scopeType === 'DEPARTMENT' && !(await tx.department.findFirst({ where: { id: input.scopeId, organizationId: actor.organizationId, status: 'ACTIVE' } }))) return 'NOT_FOUND';
      const now = new Date(); const row = await tx.permissionOverride.upsert({ where: { organizationId_userId_scopeType_scopeId_resource_action: { organizationId: actor.organizationId, userId, scopeType: input.scopeType, scopeId: input.scopeId, resource: input.resource, action: input.action } }, create: { id: randomUUID(), organizationId: actor.organizationId, userId, ...input, createdAt: now, updatedAt: now }, update: { effect: input.effect, updatedAt: now } }); return toContract(row);
    }, { isolationLevel: 'RepeatableRead' });
  }
  async removeForAdmin(actorId: string, userId: string, overrideId: string): Promise<boolean | 'NOT_FOUND' | 'FORBIDDEN'> { const actor = await activeAdmin(this.prisma, actorId); if (!actor) return 'NOT_FOUND'; if (actor === 'FORBIDDEN') return 'FORBIDDEN'; const deleted = await this.prisma.permissionOverride.deleteMany({ where: { id: overrideId, organizationId: actor.organizationId, userId } }); return deleted.count === 1 ? true : 'NOT_FOUND'; }
}
async function activeAdmin(db: PrismaClient, userId: string): Promise<{ organizationId: string } | 'FORBIDDEN' | undefined> { const member = await db.organizationMembership.findFirst({ where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } } }); if (!member) return undefined; return member.role === 'OWNER' || member.role === 'ADMIN' ? { organizationId: member.organizationId } : 'FORBIDDEN'; }
async function evaluateWithClient(db: PrismaClient, input: PermissionInput): Promise<EffectivePermissionContract> {
  const override = await db.permissionOverride.findFirst({ where: { ...input, OR: [{ scopeType: 'ORGANIZATION', scopeId: input.organizationId }, { scopeType: 'DEPARTMENT', scopeId: input.scopeId }] }, orderBy: { updatedAt: 'desc' } });
  if (override?.effect === 'DENY') return { resource: input.resource, action: input.action, allowed: false, source: 'OVERRIDE_DENY' };
  if (override?.effect === 'ALLOW') return { resource: input.resource, action: input.action, allowed: true, source: 'OVERRIDE_ALLOW' };
  const member = await db.organizationMembership.findFirst({ where: { organizationId: input.organizationId, userId: input.userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } }, include: { departmentMembership: true } });
  const orgAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN';
  const allowed = orgAdmin ? (input.resource === 'ORGANIZATION' && input.action === 'VIEW') || (input.resource === 'DEPARTMENT' && ['VIEW','MANAGE','ASSIGN'].includes(input.action)) || (input.resource === 'PERMISSION' && ['VIEW','MANAGE'].includes(input.action)) : input.resource === 'ORGANIZATION' || input.resource === 'DEPARTMENT' && input.action === 'VIEW' && member?.departmentMembership?.departmentId === input.scopeId && member.departmentMembership.status === 'ACTIVE';
  return { resource: input.resource, action: input.action, allowed, source: allowed ? 'ROLE' : 'DEFAULT_DENY' };
}
function toContract(row: { id:string; organizationId:string; userId:string; scopeType: PermissionScopeType; scopeId:string; resource: PermissionResource; action: PermissionAction; effect: PermissionEffect; createdAt:Date; updatedAt:Date }): PermissionOverrideContract { return { id:row.id,organizationId:row.organizationId,userId:row.userId,scopeType:row.scopeType,scopeId:row.scopeId,resource:row.resource,action:row.action,effect:row.effect,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString() }; }
