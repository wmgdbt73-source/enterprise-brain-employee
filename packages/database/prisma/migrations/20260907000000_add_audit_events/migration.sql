CREATE TYPE "AuditSource" AS ENUM ('ADMIN_API', 'SYSTEM');

CREATE TABLE "audit_events" (
  "audit_event_id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actor_user_id" TEXT NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_id" TEXT,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "source" "AuditSource" NOT NULL,
  "request_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "audit_events_organization_created_id_idx" ON "audit_events"("organization_id", "created_at", "audit_event_id");
CREATE INDEX "audit_events_action_created_idx" ON "audit_events"("action", "created_at");
CREATE INDEX "audit_events_subject_idx" ON "audit_events"("subject_type", "subject_id");
