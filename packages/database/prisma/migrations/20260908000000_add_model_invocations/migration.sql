CREATE TYPE "AgentRunKind" AS ENUM ('TOOL', 'MODEL');
CREATE TYPE "ModelInvocationStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
ALTER TABLE "agent_runs" ADD COLUMN "kind" "AgentRunKind" NOT NULL DEFAULT 'TOOL';
CREATE TABLE "model_invocations" (
  "model_invocation_id" TEXT NOT NULL,
  "agent_run_id" TEXT NOT NULL,
  "initiated_by_user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" "ModelInvocationStatus" NOT NULL,
  "input_text" TEXT NOT NULL,
  "input_hash" TEXT NOT NULL,
  "output_text" TEXT,
  "provider_response_id" TEXT,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "total_tokens" INTEGER,
  "error_code" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "model_invocations_pkey" PRIMARY KEY ("model_invocation_id"),
  CONSTRAINT "model_invocations_agent_run_id_key" UNIQUE ("agent_run_id"),
  CONSTRAINT "model_invocations_user_idempotency_key" UNIQUE ("initiated_by_user_id", "idempotency_key"),
  CONSTRAINT "model_invocations_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("agent_run_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "model_invocations_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
