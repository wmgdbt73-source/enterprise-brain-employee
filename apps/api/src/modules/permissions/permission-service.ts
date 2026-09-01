import type { EffectivePermissionContract, PermissionOverrideContract, PermissionAction, PermissionEffect, PermissionResource, PermissionScopeType } from '@enterprise-brain/contracts';
import { isSupportedPermission, type PermissionRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';
export class PermissionNotFoundError extends Error {} export class PermissionForbiddenError extends Error {} export class PermissionValidationError extends Error {}
export class PermissionService { constructor(private readonly permissions: PermissionRepository) {}
  async effective(context: RequestContext): Promise<EffectivePermissionContract[]> {
    const org = context.currentUser.organization; if (!org) throw new PermissionNotFoundError();
    const department = context.currentUser.department;
    const orgScope = { scopeType: 'ORGANIZATION' as const, scopeId: org.id };
    const departmentScope = department ? { scopeType: 'DEPARTMENT' as const, scopeId: department.id } : orgScope;
    const entries: Array<[PermissionResource, PermissionAction, typeof orgScope | typeof departmentScope]> = [
      ['ORGANIZATION', 'VIEW', orgScope], ['DEPARTMENT', 'VIEW', departmentScope], ['DEPARTMENT', 'MANAGE', departmentScope], ['DEPARTMENT', 'ASSIGN', departmentScope], ['PERMISSION', 'VIEW', orgScope], ['PERMISSION', 'MANAGE', orgScope], ['RESULT', 'REVIEW', orgScope]
    ];
    return Promise.all(entries.map(([resource, action, scope]) => this.permissions.evaluate({ organizationId: org.id, userId: context.currentUser.id, resource, action, ...scope })));
  }
  async list(context: RequestContext,userId:string):Promise<PermissionOverrideContract[]> { return this.unwrap(await this.permissions.listForAdmin(context.currentUser.id,userId)); }
  async put(context:RequestContext,userId:string,input:{scopeType:PermissionScopeType;scopeId:string;resource:PermissionResource;action:PermissionAction;effect:PermissionEffect}):Promise<PermissionOverrideContract>{ if (!isSupportedPermission(input.resource,input.action)) throw new PermissionValidationError('Unsupported permission resource/action'); return this.unwrap(await this.permissions.upsertForAdmin(context.currentUser.id,userId,input)); }
  async remove(context:RequestContext,userId:string,id:string):Promise<void>{this.unwrap(await this.permissions.removeForAdmin(context.currentUser.id,userId,id));}
  private unwrap<T>(value:T|'NOT_FOUND'|'FORBIDDEN'):T {if(value==='NOT_FOUND')throw new PermissionNotFoundError();if(value==='FORBIDDEN')throw new PermissionForbiddenError();return value;}
}
