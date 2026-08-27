ALTER TYPE "AgentToolCallStatus" ADD VALUE 'CANCELLED';
CREATE TYPE "HumanConfirmationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "agent_tool_calls" ADD COLUMN "device_id" TEXT;
CREATE UNIQUE INDEX "agent_tool_calls_agent_tool_call_id_agent_run_id_device_id_key" ON "agent_tool_calls"("agent_tool_call_id", "agent_run_id", "device_id");
CREATE TABLE "human_confirmations" (
  "human_confirmation_id" TEXT NOT NULL,
  "agent_run_id" TEXT NOT NULL,
  "tool_call_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "status" "HumanConfirmationStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "decided_at" TIMESTAMPTZ(3),
  CONSTRAINT "human_confirmations_pkey" PRIMARY KEY ("human_confirmation_id"),
  CONSTRAINT "human_confirmations_tool_call_id_key" UNIQUE ("tool_call_id"),
  CONSTRAINT "human_confirmations_device_id_nonblank" CHECK (btrim("device_id") <> ''),
  CONSTRAINT "human_confirmations_tool_call_id_agent_run_id_device_id_key" UNIQUE ("tool_call_id", "agent_run_id", "device_id"),
  CONSTRAINT "human_confirmations_run_scope_fkey" FOREIGN KEY ("agent_run_id", "user_id", "project_id", "task_id") REFERENCES "agent_runs"("agent_run_id", "user_id", "project_id", "task_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "human_confirmations_tool_device_fkey" FOREIGN KEY ("tool_call_id", "agent_run_id", "device_id") REFERENCES "agent_tool_calls"("agent_tool_call_id", "agent_run_id", "device_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE OR REPLACE FUNCTION require_write_confirmation() RETURNS trigger AS $$
BEGIN
  IF NEW."name" = 'write_file' AND (NEW."device_id" IS NULL OR btrim(NEW."device_id") = '') THEN
    RAISE EXCEPTION 'write_file ToolCall requires a nonblank device_id';
  ELSIF NEW."name" = 'write_file' AND NOT EXISTS (
    SELECT 1 FROM "human_confirmations" h WHERE h."tool_call_id" = NEW."agent_tool_call_id" AND h."agent_run_id" = NEW."agent_run_id" AND h."device_id" = NEW."device_id" AND h."status" = 'PENDING'
  ) THEN RAISE EXCEPTION 'write_file ToolCall requires pending HumanConfirmation'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "write_tool_call_requires_confirmation"
AFTER INSERT ON "agent_tool_calls" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_write_confirmation();
