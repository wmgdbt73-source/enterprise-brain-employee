import { randomUUID } from 'node:crypto';
import type { DepartmentContract, DepartmentMemberContract, EmployeeDirectoryEntryContract, OrganizationContract } from '@enterprise-brain/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { evaluatePermission, type PermissionDbClient } from './permission-repository.js';

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
  async employees(userId:string):Promise<EmployeeDirectoryEntryContract[]|OrganizationAccess>{return this.prisma.$transaction(async tx=>{const actor=await this.actorOrganization(tx,userId);if(typeof actor==='string')return actor;if(!(await evaluatePermission(tx,{organizationId:actor.id,userId,scopeType:'ORGANIZATION',scopeId:actor.id,resource:'ORGANIZATION',action:'VIEW'})).allowed)return 'FORBIDDEN';const rows=await tx.organizationMembership.findMany({where:{organizationId:actor.id,status:'ACTIVE'},include:{user:{include:{account:true}},departmentMembership:{include:{department:true}}},orderBy:{user:{name:'asc'}}});return rows.filter(row=>row.user.account).map(row=>({userId:row.userId,displayName:row.user.name,email:row.user.account!.login,accountStatus:row.user.account!.status,organizationRole:row.role,...(row.departmentMembership?{departmentId:row.departmentMembership.departmentId,departmentName:row.departmentMembership.department.name,departmentRole:row.departmentMembership.role}:{})}));},{isolationLevel:'RepeatableRead'});}
  async createDepartment(userId: string, name: string): Promise<DepartmentContract | OrganizationAccess> {
    return this.prisma.$transaction(async (tx) => {
      const org = await this.actorOrganization(tx, userId); if (typeof org === 'string') return org;
      if (!(await allowed(tx, org.id, userId, 'ORGANIZATION', org.id, 'DEPARTMENT', 'MANAGE'))) return 'FORBIDDEN';
      return toDepartment(await tx.department.create({ data: { id: randomUUID(), organizationId: org.id, name, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() } }));
    }, { isolationLevel: 'RepeatableRead' });
  }
  async updateDepartment(userId: string, departmentId: string, input: { name?: string; status?: 'ACTIVE' | 'DISABLED' }): Promise<DepartmentContract | OrganizationAccess> {
    return this.prisma.$transaction(async (tx) => {
      const org = await this.actorOrganization(tx, userId); if (typeof org === 'string') return org;
      const department = await tx.department.findFirst({ where: { id: departmentId, organizationId: org.id } }); if (!department) return 'NOT_FOUND';
      if (!(await allowed(tx, org.id, userId, 'DEPARTMENT', department.id, 'DEPARTMENT', 'MANAGE'))) return 'FORBIDDEN';
      return toDepartment(await tx.department.update({ where: { id: department.id }, data: { ...input, updatedAt: new Date() } }));
    }, { isolationLevel: 'RepeatableRead' });
  }
  async members(userId: string, departmentId: string): Promise<DepartmentMemberContract[] | OrganizationAccess> {
    return this.prisma.$transaction(async (tx) => {
      const org = await this.actorOrganization(tx, userId); if (typeof org === 'string') return org;
      const department = await tx.department.findFirst({ where: { id: departmentId, organizationId: org.id } }); if (!department) return 'NOT_FOUND';
      if (!(await allowed(tx, org.id, userId, 'DEPARTMENT', departmentId, 'DEPARTMENT', 'VIEW'))) return 'FORBIDDEN';
      const rows = await tx.departmentMembership.findMany({ where: { departmentId, status: 'ACTIVE' }, include: { organizationMembership: { include: { user: true } } }, orderBy: { createdAt: 'asc' } });
      return rows.map((row) => ({ userId: row.userId, name: row.organizationMembership.user.name, role: row.role, status: row.status }));
    }, { isolationLevel: 'RepeatableRead' });
  }
  async assign(userId: string, targetUserId: string, departmentId: string, role: 'MANAGER' | 'MEMBER'): Promise<DepartmentMemberContract | OrganizationAccess> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.actorOrganization(tx, userId); if (typeof actor === 'string') return actor;
      const [department, target] = await Promise.all([
        tx.department.findFirst({ where: { id: departmentId, organizationId: actor.id, status: 'ACTIVE' } }),
        tx.organizationMembership.findFirst({ where: { organizationId: actor.id, userId: targetUserId, status: 'ACTIVE' } })
      ]);
      if (!department || !target) return 'NOT_FOUND';
      if (!(await allowed(tx, actor.id, userId, 'DEPARTMENT', department.id, 'DEPARTMENT', 'ASSIGN'))) return 'FORBIDDEN';
      const now = new Date();
      const row = await tx.departmentMembership.upsert({
        where: { organizationId_userId: { organizationId: actor.id, userId: targetUserId } },
        create: { id: randomUUID(), organizationId: actor.id, departmentId: department.id, userId: targetUserId, role, status: 'ACTIVE', createdAt: now, updatedAt: now },
        update: { departmentId: department.id, role, status: 'ACTIVE', updatedAt: now },
        include: { organizationMembership: { include: { user: true } } }
      });
      return { userId: row.userId, name: row.organizationMembership.user.name, role: row.role, status: row.status };
    }, { isolationLevel: 'RepeatableRead' });
  }
  private async actorOrganization(db: PermissionDbClient, userId: string): Promise<{ id: string } | OrganizationAccess> {
    const member = await db.organizationMembership.findFirst({ where: { userId, ...activeMembership }, include: { organization: true } });
    if (!member) return 'NOT_FOUND';
    return { id: member.organizationId };
  }
}
async function allowed(db: PermissionDbClient, organizationId: string, userId: string, scopeType: 'ORGANIZATION' | 'DEPARTMENT', scopeId: string, resource: 'DEPARTMENT', action: 'VIEW' | 'MANAGE' | 'ASSIGN'): Promise<boolean> { return (await evaluatePermission(db, { organizationId, userId, scopeType, scopeId, resource, action })).allowed; }
function toDepartment(row: { id: string; organizationId: string; name: string; status: 'ACTIVE' | 'DISABLED'; createdAt: Date; updatedAt: Date }): DepartmentContract { return { id: row.id, organizationId: row.organizationId, name: row.name, status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
