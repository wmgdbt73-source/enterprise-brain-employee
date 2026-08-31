import type { EffectivePermissionContract, PermissionOverrideContract, PermissionAction, PermissionEffect, PermissionResource, PermissionScopeType } from '@enterprise-brain/contracts';
import type { PermissionRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';
export class PermissionNotFoundError extends Error {} export class PermissionForbiddenError extends Error {}
export class PermissionService { constructor(private readonly permissions: PermissionRepository) {}
  async effective(context: RequestContext): Promise<EffectivePermissionContract[]> { const org=context.currentUser.organization; if(!org) throw new PermissionNotFoundError(); const scopeId=context.currentUser.department?.id ?? org.id; return Promise.all(([['ORGANIZATION','VIEW'],['DEPARTMENT','VIEW'],['DEPARTMENT','MANAGE'],['DEPARTMENT','ASSIGN'],['PERMISSION','VIEW'],['PERMISSION','MANAGE'],['RESULT','REVIEW']] as [PermissionResource,PermissionAction][]).map(([resource,action])=>this.permissions.evaluate({organizationId:org.id,userId:context.currentUser.id,scopeType:'ORGANIZATION',scopeId,resource,action}))); }
  async list(context: RequestContext,userId:string):Promise<PermissionOverrideContract[]> { return this.unwrap(await this.permissions.listForAdmin(context.currentUser.id,userId)); }
  async put(context:RequestContext,userId:string,input:{scopeType:PermissionScopeType;scopeId:string;resource:PermissionResource;action:PermissionAction;effect:PermissionEffect}):Promise<PermissionOverrideContract>{ return this.unwrap(await this.permissions.upsertForAdmin(context.currentUser.id,userId,input)); }
  async remove(context:RequestContext,userId:string,id:string):Promise<void>{this.unwrap(await this.permissions.removeForAdmin(context.currentUser.id,userId,id));}
  private unwrap<T>(value:T|'NOT_FOUND'|'FORBIDDEN'):T {if(value==='NOT_FOUND')throw new PermissionNotFoundError();if(value==='FORBIDDEN')throw new PermissionForbiddenError();return value;}
}
