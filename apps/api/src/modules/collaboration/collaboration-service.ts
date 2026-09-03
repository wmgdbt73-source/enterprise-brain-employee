import type { CollaborationRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';

export class CollaborationNotFoundError extends Error {}
export class CollaborationForbiddenError extends Error {}
export class CollaborationValidationError extends Error {}
export class CollaborationIdempotencyConflictError extends Error {}
export class CollaborationService {
  constructor(private readonly repository: CollaborationRepository) {}
  async createConversation(c:RequestContext,input:Parameters<CollaborationRepository['createConversation']>[1]){return this.unwrap(await this.repository.createConversation(c.currentUser.id,input));}
  async conversations(c:RequestContext,input:Parameters<CollaborationRepository['listConversations']>[1]){return this.unwrap(await this.repository.listConversations(c.currentUser.id,input));}
  async conversation(c:RequestContext,id:string){return this.unwrap(await this.repository.getConversation(c.currentUser.id,id));}
  async createMessage(c:RequestContext,id:string,input:Parameters<CollaborationRepository['createMessage']>[2],key:string){return this.unwrap(await this.repository.createMessage(c.currentUser.id,id,input,key));}
  async messages(c:RequestContext,id:string,input:{cursor?:string;limit?:number}){return this.unwrap(await this.repository.listMessages(c.currentUser.id,id,input));}
  async notifications(c:RequestContext,input:Parameters<CollaborationRepository['notifications']>[1]){return this.unwrap(await this.repository.notifications(c.currentUser.id,input));}
  async markNotification(c:RequestContext,id:string,read:boolean){return this.unwrap(await this.repository.markNotification(c.currentUser.id,id,read));}
  async createReminder(c:RequestContext,input:Parameters<CollaborationRepository['createReminder']>[1]){return this.unwrap(await this.repository.createReminder(c.currentUser.id,input));}
  async reminders(c:RequestContext,input:{cursor?:string;limit?:number}){return this.unwrap(await this.repository.listReminders(c.currentUser.id,input));}
  async updateReminder(c:RequestContext,id:string,input:Parameters<CollaborationRepository['updateReminder']>[2]){return this.unwrap(await this.repository.updateReminder(c.currentUser.id,id,input));}
  async actionItems(c:RequestContext){return this.unwrap(await this.repository.actionItems(c.currentUser.id));}
  async library(c:RequestContext,input:Parameters<CollaborationRepository['library']>[1]){return this.unwrap(await this.repository.library(c.currentUser.id,input));}
  async libraryItem(c:RequestContext,id:string){return this.unwrap(await this.repository.libraryItem(c.currentUser.id,id));}
  async swarmEvents(c:RequestContext,input:Parameters<CollaborationRepository['swarmEvents']>[1]){return this.unwrap(await this.repository.swarmEvents(c.currentUser.id,input));}
  private unwrap<T>(value:T|'NOT_FOUND'|'FORBIDDEN'|'INVALID'|'CONFLICT'):T{if(value==='NOT_FOUND')throw new CollaborationNotFoundError();if(value==='FORBIDDEN')throw new CollaborationForbiddenError();if(value==='INVALID')throw new CollaborationValidationError();if(value==='CONFLICT')throw new CollaborationIdempotencyConflictError();return value;}
}
