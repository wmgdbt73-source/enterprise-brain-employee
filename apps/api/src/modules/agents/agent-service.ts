import type { AgentAssignmentContract, AgentAssignmentScopeType, AgentDefinitionContract, AgentRuntimeProfile, AvailableAgentContract } from '@enterprise-brain/contracts';
import type { AgentCatalogRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';
export class AgentNotFoundError extends Error {}
export class AgentForbiddenError extends Error {}
export class AgentService { constructor(private readonly agents:AgentCatalogRepository) {}
  private map<T>(v:T|'NOT_FOUND'|'FORBIDDEN'):T { if(v==='NOT_FOUND')throw new AgentNotFoundError();if(v==='FORBIDDEN')throw new AgentForbiddenError();return v; }
  list(c:RequestContext):Promise<AgentDefinitionContract[]>{return this.agents.listForAdmin(c.currentUser.id).then(v=>this.map(v));}
  create(c:RequestContext,input:{key:string;name:string;description?:string;runtimeProfile:AgentRuntimeProfile}):Promise<AgentDefinitionContract>{return this.agents.create(c.currentUser.id,input).then(v=>this.map(v));}
  update(c:RequestContext,id:string,input:{name?:string;description?:string;status?:'ACTIVE'|'DISABLED'}):Promise<AgentDefinitionContract>{return this.agents.update(c.currentUser.id,id,input).then(v=>this.map(v));}
  assignments(c:RequestContext,id:string):Promise<AgentAssignmentContract[]>{return this.agents.assignments(c.currentUser.id,id).then(v=>this.map(v));}
  assign(c:RequestContext,id:string,input:{scopeType:AgentAssignmentScopeType;scopeId:string}):Promise<AgentAssignmentContract>{return this.agents.assign(c.currentUser.id,id,input).then(v=>this.map(v));}
  async remove(c:RequestContext,id:string,assignmentId:string):Promise<void>{this.map(await this.agents.removeAssignment(c.currentUser.id,id,assignmentId));}
  available(c:RequestContext):Promise<AvailableAgentContract[]>{return this.agents.availableForUser(c.currentUser.id);}
}
