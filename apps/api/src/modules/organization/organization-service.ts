import type { DepartmentContract, DepartmentMemberContract, EmployeeDirectoryEntryContract, OrganizationContract } from '@enterprise-brain/contracts';
import type { OrganizationRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';
export class OrganizationNotFoundError extends Error {}
export class OrganizationForbiddenError extends Error {}
export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}
  async get(context: RequestContext): Promise<OrganizationContract> { const value = await this.repository.current(context.currentUser.id); if (!value) throw new OrganizationNotFoundError(); return value; }
  async list(context: RequestContext): Promise<DepartmentContract[]> { const value = await this.repository.listDepartments(context.currentUser.id); if (!value) throw new OrganizationNotFoundError(); return value; }
  async employees(context:RequestContext):Promise<EmployeeDirectoryEntryContract[]>{return this.unwrap(await this.repository.employees(context.currentUser.id));}
  async create(context: RequestContext, name: string): Promise<DepartmentContract> { return this.unwrap(await this.repository.createDepartment(context.currentUser.id, name)); }
  async update(context: RequestContext, id: string, input: { name?: string; status?: 'ACTIVE' | 'DISABLED' }): Promise<DepartmentContract> { return this.unwrap(await this.repository.updateDepartment(context.currentUser.id, id, input)); }
  async members(context: RequestContext, id: string): Promise<DepartmentMemberContract[]> { return this.unwrap(await this.repository.members(context.currentUser.id, id)); }
  async assign(context: RequestContext, userId: string, departmentId: string, role: 'MANAGER' | 'MEMBER'): Promise<DepartmentMemberContract> { return this.unwrap(await this.repository.assign(context.currentUser.id, userId, departmentId, role)); }
  private unwrap<T>(value: T | 'NOT_FOUND' | 'FORBIDDEN'): T { if (value === 'NOT_FOUND') throw new OrganizationNotFoundError(); if (value === 'FORBIDDEN') throw new OrganizationForbiddenError(); return value; }
}
