CREATE TYPE "ArtifactType" AS ENUM ('FILE');
CREATE TYPE "ArtifactStorageKind" AS ENUM ('LOCAL_WORKSPACE');

CREATE UNIQUE INDEX "agent_runs_agent_run_id_user_id_project_id_task_id_key"
  ON "agent_runs"("agent_run_id", "user_id", "project_id", "task_id");
CREATE UNIQUE INDEX "agent_tool_calls_agent_tool_call_id_agent_run_id_key"
  ON "agent_tool_calls"("agent_tool_call_id", "agent_run_id");

CREATE TABLE "artifacts" (
  "artifact_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "agent_run_id" TEXT NOT NULL,
  "source_tool_call_id" TEXT NOT NULL,
  "type" "ArtifactType" NOT NULL,
  "storage_kind" "ArtifactStorageKind" NOT NULL,
  "relative_path" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "encoding" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "artifacts_pkey" PRIMARY KEY ("artifact_id"),
  CONSTRAINT "artifacts_source_tool_call_id_key" UNIQUE ("source_tool_call_id"),
  CONSTRAINT "artifacts_task_id_project_id_fkey"
    FOREIGN KEY ("task_id", "project_id")
    REFERENCES "tasks"("task_id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "artifacts_agent_run_id_created_by_user_id_project_id_task_id_fkey"
    FOREIGN KEY ("agent_run_id", "created_by_user_id", "project_id", "task_id")
    REFERENCES "agent_runs"("agent_run_id", "user_id", "project_id", "task_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "artifacts_source_tool_call_id_agent_run_id_fkey"
    FOREIGN KEY ("source_tool_call_id", "agent_run_id")
    REFERENCES "agent_tool_calls"("agent_tool_call_id", "agent_run_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "artifacts_relative_path_not_empty" CHECK ("relative_path" <> ''),
  CONSTRAINT "artifacts_size_non_negative" CHECK ("size" >= 0),
  CONSTRAINT "artifacts_encoding_utf8" CHECK ("encoding" = 'utf-8'),
  CONSTRAINT "artifacts_sha256_valid" CHECK ("sha256" ~* '^[0-9a-f]{64}$'),
  CONSTRAINT "artifacts_version_one" CHECK ("version" = 1)
);
