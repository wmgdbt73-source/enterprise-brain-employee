import { randomUUID } from 'node:crypto';
import type { DepartmentContract, DepartmentMemberContract, OrganizationContract } from '@enterprise-brain/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';

export type OrganizationAccess = 'NOT_FOUND' | 'FORBIDDEN';
const activeMembership = { status: 'ACTIVE' as const, organization: { status: 'ACTIVE' as const } };

export class OrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async current(userId: string): Promise<OrganizationContract | undefined> {
    const member = await this.prisma.organizationMembership.findFirst({ where: { userId, ...activeMembership }, include: { organization: true } });
    return member ? { id: member.organization.id, name: member.organization.name, status: member.organization.status, role: member.role } : undefined;
  }
  async listDepartments(userId: string): Promise<DepartmentContract[] | undefined> {
    const org = await this.current(userId); if (!org) return undefined;
    const rows = await this.prisma.department.findMany({ where: { organizationId: org.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    return rows.map(toDepartment);
  }
  async createDepartment(userId: string, name: string): Promise<DepartmentContract | OrganizationAccess> {
    const org = await this.adminOrganization(userId); if (typeof org === 'string') return org;
    return toDepartment(await this.prisma.department.create({ data: { id: randomUUID(), organizationId: org.id, name, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() } }));
  }
  async updateDepartment(userId: string, departmentId: string, input: { name?: string; status?: 'ACTIVE' | 'DISABLED' }): Promise<DepartmentContract | OrganizationAccess> {
    const org = await this.adminOrganization(userId); if (typeof org === 'string') return org;
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId: org.id } }); if (!department) return 'NOT_FOUND';
    return toDepartment(await this.prisma.department.update({ where: { id: department.id }, data: { ...input, updatedAt: new Date() } }));
  }
  async members(userId: string, departmentId: string): Promise<DepartmentMemberContract[] | OrganizationAccess> {
    const access = await this.departmentManagerOrAdmin(userId, departmentId); if (typeof access === 'string') return access;
    const rows = await this.prisma.departmentMembership.findMany({ where: { departmentId, status: 'ACTIVE' }, include: { organizationMembership: { include: { user: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => ({ userId: row.userId, name: row.organizationMembership.user.name, role: row.role, status: row.status }));
  }
  async assign(userId: string, targetUserId: string, departmentId: string, role: 'MANAGER' | 'MEMBER'): Promise<DepartmentMemberContract | OrganizationAccess> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await tx.organizationMembership.findFirst({ where: { userId, ...activeMembership }, include: { organization: true } });
      if (!actor) return 'NOT_FOUND';
      if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') return 'FORBIDDEN';
      const [department, target] = await Promise.all([
        tx.department.findFirst({ where: { id: departmentId, organizationId: actor.organizationId, status: 'ACTIVE' } }),
        tx.organizationMembership.findFirst({ where: { organizationId: actor.organizationId, userId: targetUserId, status: 'ACTIVE' } })
      ]);
      if (!department || !target) return 'NOT_FOUND';
      const now = new Date();
      const row = await tx.departmentMembership.upsert({
        where: { organizationId_userId: { organizationId: actor.organizationId, userId: targetUserId } },
        create: { id: randomUUID(), organizationId: actor.organizationId, departmentId: department.id, userId: targetUserId, role, status: 'ACTIVE', createdAt: now, updatedAt: now },
        update: { departmentId: department.id, role, status: 'ACTIVE', updatedAt: now },
        include: { organizationMembership: { include: { user: true } } }
      });
      return { userId: row.userId, name: row.organizationMembership.user.name, role: row.role, status: row.status };
    }, { isolationLevel: 'RepeatableRead' });
  }
  private async adminOrganization(userId: string): Promise<{ id: string } | OrganizationAccess> {
    const member = await this.prisma.organizationMembership.findFirst({ where: { userId, ...activeMembership }, include: { organization: true } });
    if (!member) return 'NOT_FOUND';
    return member.role === 'OWNER' || member.role === 'ADMIN' ? { id: member.organizationId } : 'FORBIDDEN';
  }
  private async departmentManagerOrAdmin(userId: string, departmentId: string): Promise<true | OrganizationAccess> {
    const own = await this.prisma.organizationMembership.findFirst({ where: { userId, ...activeMembership }, include: { departmentMembership: true } });
    if (!own) return 'NOT_FOUND';
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId: own.organizationId } });
    if (!department) return 'NOT_FOUND';
    if (own.role === 'OWNER' || own.role === 'ADMIN' || (own.departmentMembership?.departmentId === departmentId && own.departmentMembership.status === 'ACTIVE' && own.departmentMembership.role === 'MANAGER')) return true;
    return 'FORBIDDEN';
  }
}
function toDepartment(row: { id: string; organizationId: string; name: string; status: 'ACTIVE' | 'DISABLED'; createdAt: Date; updatedAt: Date }): DepartmentContract { return { id: row.id, organizationId: row.organizationId, name: row.name, status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
