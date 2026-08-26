CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_HUMAN', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AgentToolCallStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "agent_runs" (
  "agent_run_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "agent_definition_key" TEXT NOT NULL,
  "intent" JSONB NOT NULL,
  "status" "AgentRunStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("agent_run_id"),
  CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "agent_tool_calls" (
  "agent_tool_call_id" TEXT NOT NULL,
  "agent_run_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "status" "AgentToolCallStatus" NOT NULL,
  "receipt" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("agent_tool_call_id"),
  CONSTRAINT "agent_tool_calls_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("agent_run_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_tool_calls_agent_run_id_sequence_key" ON "agent_tool_calls"("agent_run_id", "sequence");
