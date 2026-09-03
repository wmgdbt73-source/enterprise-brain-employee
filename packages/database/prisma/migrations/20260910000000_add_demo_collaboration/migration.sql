CREATE TYPE "ConversationType" AS ENUM ('AI_THREAD', 'PROJECT', 'TASK', 'HUMAN_GROUP', 'HUMAN_DM');
CREATE TYPE "ConversationScopeType" AS ENUM ('USER', 'PROJECT', 'TASK', 'DEPARTMENT');
CREATE TYPE "MessageAuthorType" AS ENUM ('USER', 'AGENT', 'SYSTEM');
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SNOOZED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ReminderType" AS ENUM ('TASK_DEADLINE', 'MEETING', 'REVIEW', 'CUSTOM');
CREATE TYPE "SwarmScopeType" AS ENUM ('DEPARTMENT', 'PROJECT');
CREATE TYPE "SwarmEventType" AS ENUM ('WORK_EVENT', 'GROUP_MESSAGE');

CREATE TABLE "conversations" (
  "conversation_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "type" "ConversationType" NOT NULL,
  "scope_type" "ConversationScopeType" NOT NULL,
  "scope_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversation_id"),
  CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "conversations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "conversations_organization_updated_id_idx" ON "conversations"("organization_id", "updated_at", "conversation_id");

CREATE TABLE "conversation_participants" (
  "conversation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id", "user_id"),
  CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "conversation_participants_user_conversation_idx" ON "conversation_participants"("user_id", "conversation_id");

CREATE TABLE "messages" (
  "message_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "author_type" "MessageAuthorType" NOT NULL,
  "author_user_id" TEXT,
  "author_agent_id" TEXT,
  "content" TEXT NOT NULL,
  "reply_to_message_id" TEXT,
  "mentioned_user_ids" TEXT[] NOT NULL,
  "mentioned_agent_ids" TEXT[] NOT NULL,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "edited_at" TIMESTAMPTZ(3),
  CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id"),
  CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("message_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "messages_conversation_author_idempotency_key" UNIQUE ("conversation_id", "author_user_id", "idempotency_key")
);
CREATE INDEX "messages_conversation_created_id_idx" ON "messages"("conversation_id", "created_at", "message_id");

CREATE TABLE "notifications" (
  "notification_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "recipient_user_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "deep_link" TEXT NOT NULL,
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id"),
  CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "notifications_recipient_created_id_idx" ON "notifications"("recipient_user_id", "created_at", "notification_id");

CREATE TABLE "reminders" (
  "reminder_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "ReminderType" NOT NULL,
  "title" TEXT NOT NULL,
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "ReminderStatus" NOT NULL,
  "deep_link" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "reminders_pkey" PRIMARY KEY ("reminder_id"),
  CONSTRAINT "reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "reminders_user_status_due_id_idx" ON "reminders"("user_id", "status", "due_at", "reminder_id");

CREATE TABLE "swarm_events" (
  "swarm_event_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "scope_type" "SwarmScopeType" NOT NULL,
  "scope_id" TEXT NOT NULL,
  "type" "SwarmEventType" NOT NULL,
  "actor_user_id" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "deep_link" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "swarm_events_pkey" PRIMARY KEY ("swarm_event_id"),
  CONSTRAINT "swarm_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "swarm_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "swarm_events_organization_occurred_id_idx" ON "swarm_events"("organization_id", "occurred_at", "swarm_event_id");
