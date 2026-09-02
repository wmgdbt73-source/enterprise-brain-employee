/** Shared read-model pagination for Demo Sprint APIs. Cursors are opaque strings. */
export type CursorPage<T> = { items: T[]; nextCursor: string | null };

export type ConversationType = 'AI_THREAD' | 'PROJECT' | 'TASK' | 'HUMAN_GROUP' | 'HUMAN_DM';
export type ConversationScopeType = 'USER' | 'PROJECT' | 'TASK' | 'DEPARTMENT';
export interface ConversationContract {
  conversationId: string; organizationId: string; type: ConversationType; scopeType: ConversationScopeType; scopeId: string;
  title: string; createdByUserId: string; createdAt: string; updatedAt: string;
}
export type Conversation = ConversationContract;
export interface CreateConversationRequest { type: ConversationType; scopeType: ConversationScopeType; scopeId: string; title: string; participantUserIds: string[]; }
export interface ConversationListQuery { type?: ConversationType; scopeType?: ConversationScopeType; scopeId?: string; cursor?: string; limit?: number; }

export type MessageAuthorType = 'USER' | 'AGENT' | 'SYSTEM';
export interface MessageContract {
  messageId: string; conversationId: string; authorType: MessageAuthorType; authorUserId: string | null; authorAgentId: string | null;
  content: string; replyToMessageId: string | null; mentionedUserIds: string[]; mentionedAgentIds: string[];
  createdAt: string; editedAt: string | null;
}
export type Message = MessageContract;
export interface CreateMessageRequest { content: string; replyToMessageId?: string; mentionedUserIds?: string[]; mentionedAgentIds?: string[]; }

export type NotificationType = 'AGENT_FINISHED' | 'RESULT_REVIEWED' | 'MENTION' | 'TASK_STATUS_CHANGED' | 'PERMISSION_CHANGED';
export interface NotificationContract {
  notificationId: string; organizationId: string; recipientUserId: string; type: NotificationType; title: string; body: string;
  deepLink: string; readAt: string | null; createdAt: string;
}
export type Notification = NotificationContract;
export interface NotificationListQuery { unreadOnly?: boolean; cursor?: string; limit?: number; }
export interface MarkNotificationReadRequest { read: boolean; }

export type ReminderStatus = 'SCHEDULED' | 'SNOOZED' | 'COMPLETED' | 'CANCELLED';
export type ReminderType = 'TASK_DEADLINE' | 'MEETING' | 'REVIEW' | 'CUSTOM';
export interface ReminderContract {
  reminderId: string; organizationId: string; userId: string; type: ReminderType; title: string; dueAt: string;
  status: ReminderStatus; deepLink: string; createdAt: string; updatedAt: string;
}
export type Reminder = ReminderContract;
export interface CreateReminderRequest { type: ReminderType; title: string; dueAt: string; deepLink: string; }
export interface UpdateReminderRequest { title?: string; dueAt?: string; status?: ReminderStatus; deepLink?: string; }

export type ActionItemType = 'CONFIRM_ARTIFACT' | 'SUBMIT_RESULT' | 'HUMAN_REVIEW' | 'REPLY_MENTION' | 'APPROVE_PERMISSION';
export type ActionItemStatus = 'OPEN' | 'COMPLETED';
export interface ActionItemContract {
  actionItemId: string; organizationId: string; assigneeUserId: string; type: ActionItemType; title: string; deepLink: string;
  status: ActionItemStatus; dueAt: string | null; createdAt: string; completedAt: string | null;
}
export type ActionItem = ActionItemContract;

export type LibraryItemType = 'FILE' | 'ARTIFACT' | 'RESULT' | 'KNOWLEDGE' | 'DECISION' | 'MEETING';
export type LibraryScopeType = 'USER' | 'PROJECT' | 'DEPARTMENT' | 'ORGANIZATION';
export interface LibraryItemContract {
  libraryItemId: string; organizationId: string; type: LibraryItemType; scopeType: LibraryScopeType; scopeId: string;
  title: string; summary: string | null; sourceObjectId: string; sourceObjectType: string; createdByUserId: string;
  createdAt: string; updatedAt: string;
}
export type LibraryItem = LibraryItemContract;
export interface LibraryListQuery { type?: LibraryItemType; scopeType?: LibraryScopeType; scopeId?: string; cursor?: string; limit?: number; }

export type SwarmScopeType = 'DEPARTMENT' | 'PROJECT';
export type SwarmEventType = 'WORK_EVENT' | 'GROUP_MESSAGE';
export interface SwarmEventContract {
  swarmEventId: string; organizationId: string; scopeType: SwarmScopeType; scopeId: string; type: SwarmEventType;
  actorUserId: string | null; title: string; summary: string; deepLink: string; occurredAt: string;
}
export type SwarmEvent = SwarmEventContract;
export interface SwarmEventListQuery { scopeType: SwarmScopeType; scopeId: string; type?: SwarmEventType; cursor?: string; limit?: number; }

/** Single source of typed Demo Sprint API paths; no Fastify routes are registered in EB-D00. */
export const demoRoutes = {
  conversations: '/conversations',
  conversation: (conversationId: string) => `/conversations/${conversationId}`,
  conversationMessages: (conversationId: string) => `/conversations/${conversationId}/messages`,
  notifications: '/notifications',
  notificationRead: (notificationId: string) => `/notifications/${notificationId}/read`,
  reminders: '/reminders',
  reminder: (reminderId: string) => `/reminders/${reminderId}`,
  actionItems: '/action-items',
  libraryItems: '/library-items',
  libraryItem: (libraryItemId: string) => `/library-items/${libraryItemId}`,
  swarmEvents: '/swarm-events'
} as const;
