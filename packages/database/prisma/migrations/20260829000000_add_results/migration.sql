CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'CANDIDATE', 'HUMAN_REVIEW', 'ACCEPTED', 'REWORK');

CREATE UNIQUE INDEX "artifacts_artifact_id_task_id_project_id_key"
  ON "artifacts"("artifact_id", "task_id", "project_id");

CREATE TABLE "results" (
  "result_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "status" "ResultStatus" NOT NULL,
  "idempotency_key" VARCHAR(64) NOT NULL,
  "request_fingerprint" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "results_pkey" PRIMARY KEY ("result_id"),
  CONSTRAINT "results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "results_task_id_project_id_fkey" FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("task_id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "results_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "results_result_id_task_id_project_id_key" UNIQUE ("result_id", "task_id", "project_id"),
  CONSTRAINT "results_creator_task_idempotency_key_key" UNIQUE ("created_by_user_id", "task_id", "idempotency_key"),
  CONSTRAINT "results_idempotency_key_not_blank" CHECK (length(trim("idempotency_key")) > 0),
  CONSTRAINT "results_request_fingerprint_valid" CHECK ("request_fingerprint" ~* '^[0-9a-f]{64}$')
);

CREATE TABLE "result_artifacts" (
  "result_id" TEXT NOT NULL,
  "artifact_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  CONSTRAINT "result_artifacts_pkey" PRIMARY KEY ("result_id", "artifact_id"),
  CONSTRAINT "result_artifacts_result_id_task_id_project_id_fkey" FOREIGN KEY ("result_id", "task_id", "project_id") REFERENCES "results"("result_id", "task_id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "result_artifacts_artifact_id_task_id_project_id_fkey" FOREIGN KEY ("artifact_id", "task_id", "project_id") REFERENCES "artifacts"("artifact_id", "task_id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
