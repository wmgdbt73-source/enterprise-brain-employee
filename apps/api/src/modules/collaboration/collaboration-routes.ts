import { demoRoutes, type ConversationScopeType, type ConversationType, type LibraryListQuery, type ReminderStatus, type ReminderType, type SwarmEventType } from '@enterprise-brain/contracts';
import type { FastifyInstance } from 'fastify';
import { CollaborationService } from './collaboration-service.js';

const id={type:'string',minLength:1} as const;
const cursor={type:'object',additionalProperties:false,properties:{cursor:id,limit:{type:'integer',minimum:1,maximum:50}}} as const;
const conversationQuery={type:'object',additionalProperties:false,properties:{...cursor.properties,type:{type:'string',enum:['AI_THREAD','PROJECT','TASK','HUMAN_GROUP','HUMAN_DM']},scopeType:{type:'string',enum:['USER','PROJECT','TASK','DEPARTMENT']},scopeId:id}} as const;
const createConversation={type:'object',additionalProperties:false,required:['type','scopeType','scopeId','title','participantUserIds'],properties:{type:{type:'string',enum:['AI_THREAD','PROJECT','TASK','HUMAN_GROUP','HUMAN_DM']},scopeType:{type:'string',enum:['USER','PROJECT','TASK','DEPARTMENT']},scopeId:id,title:id,participantUserIds:{type:'array',items:id,maxItems:100}}} as const;
const createMessage={type:'object',additionalProperties:false,required:['content'],properties:{content:id,replyToMessageId:id,mentionedUserIds:{type:'array',items:id,maxItems:100},mentionedAgentIds:{type:'array',items:id,maxItems:100}}} as const;
const notificationQuery={type:'object',additionalProperties:false,properties:{...cursor.properties,unreadOnly:{type:'boolean'}}} as const;
const reminder={type:'object',additionalProperties:false,required:['type','title','dueAt','deepLink'],properties:{type:{type:'string',enum:['TASK_DEADLINE','MEETING','REVIEW','CUSTOM']},title:id,dueAt:{type:'string',format:'date-time'},deepLink:id}} as const;
const updateReminder={type:'object',additionalProperties:false,properties:{title:id,dueAt:{type:'string',format:'date-time'},status:{type:'string',enum:['SCHEDULED','SNOOZED','COMPLETED','CANCELLED']},deepLink:id}} as const;
const libraryQuery={type:'object',additionalProperties:false,properties:{...cursor.properties,type:{type:'string',enum:['FILE','ARTIFACT','RESULT','KNOWLEDGE','DECISION','MEETING']},scopeType:{type:'string',enum:['USER','PROJECT','DEPARTMENT','ORGANIZATION']},scopeId:id}} as const;
const swarmQuery={type:'object',additionalProperties:false,required:['scopeType','scopeId'],properties:{...cursor.properties,scopeType:{type:'string',enum:['DEPARTMENT','PROJECT']},scopeId:id,type:{type:'string',enum:['WORK_EVENT','GROUP_MESSAGE']}}} as const;
const params=(name:string)=>({type:'object',additionalProperties:false,required:[name],properties:{[name]:id}}) as const;

export function registerCollaborationRoutes(app:FastifyInstance,service:CollaborationService){
  app.post<{Body:{type:ConversationType;scopeType:ConversationScopeType;scopeId:string;title:string;participantUserIds:string[]}}>(demoRoutes.conversations,{schema:{body:createConversation}},async r=>service.createConversation(r.requestContext,r.body));
  app.get<{Querystring:{type?:ConversationType;scopeType?:ConversationScopeType;scopeId?:string;cursor?:string;limit?:number}}>(demoRoutes.conversations,{schema:{querystring:conversationQuery}},async r=>service.conversations(r.requestContext,r.query));
  app.get<{Params:{conversationId:string}}>(demoRoutes.conversation(':conversationId'),{schema:{params:params('conversationId')}},async r=>service.conversation(r.requestContext,r.params.conversationId));
  app.post<{Params:{conversationId:string};Headers:{'idempotency-key':string};Body:{content:string;replyToMessageId?:string;mentionedUserIds?:string[];mentionedAgentIds?:string[]}}>(demoRoutes.conversationMessages(':conversationId'),{schema:{params:params('conversationId'),headers:{type:'object',required:['idempotency-key'],properties:{'idempotency-key':id},additionalProperties:true},body:createMessage}},async r=>service.createMessage(r.requestContext,r.params.conversationId,r.body,r.headers['idempotency-key']));
  app.get<{Params:{conversationId:string};Querystring:{cursor?:string;limit?:number}}>(demoRoutes.conversationMessages(':conversationId'),{schema:{params:params('conversationId'),querystring:cursor}},async r=>service.messages(r.requestContext,r.params.conversationId,r.query));
  app.get<{Querystring:{unreadOnly?:boolean;cursor?:string;limit?:number}}>(demoRoutes.notifications,{schema:{querystring:notificationQuery}},async r=>service.notifications(r.requestContext,r.query));
  app.patch<{Params:{notificationId:string};Body:{read:boolean}}>(demoRoutes.notificationRead(':notificationId'),{schema:{params:params('notificationId'),body:{type:'object',additionalProperties:false,required:['read'],properties:{read:{type:'boolean'}}}}},async r=>service.markNotification(r.requestContext,r.params.notificationId,r.body.read));
  app.post<{Body:{type:ReminderType;title:string;dueAt:string;deepLink:string}}>(demoRoutes.reminders,{schema:{body:reminder}},async r=>service.createReminder(r.requestContext,r.body));
  app.get<{Querystring:{cursor?:string;limit?:number}}>(demoRoutes.reminders,{schema:{querystring:cursor}},async r=>service.reminders(r.requestContext,r.query));
  app.patch<{Params:{reminderId:string};Body:{title?:string;dueAt?:string;status?:ReminderStatus;deepLink?:string}}>(demoRoutes.reminder(':reminderId'),{schema:{params:params('reminderId'),body:updateReminder}},async r=>service.updateReminder(r.requestContext,r.params.reminderId,r.body));
  app.get(demoRoutes.actionItems,async r=>service.actionItems(r.requestContext));
  app.get<{Querystring:LibraryListQuery}>(demoRoutes.libraryItems,{schema:{querystring:libraryQuery}},async r=>service.library(r.requestContext,r.query));
  app.get<{Params:{libraryItemId:string}}>(demoRoutes.libraryItem(':libraryItemId'),{schema:{params:params('libraryItemId')}},async r=>service.libraryItem(r.requestContext,r.params.libraryItemId));
  app.get<{Querystring:{scopeType:'DEPARTMENT'|'PROJECT';scopeId:string;type?:SwarmEventType;cursor?:string;limit?:number}}>(demoRoutes.swarmEvents,{schema:{querystring:swarmQuery}},async r=>service.swarmEvents(r.requestContext,r.query));
}
