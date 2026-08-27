CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'CANDIDATE', 'HUMAN_REVIEW', 'ACCEPTED', 'REWORK');
CREATE TABLE "results" (
  "result_id" TEXT NOT NULL, "task_id" TEXT NOT NULL, "project_id" TEXT NOT NULL,
  "status" "ResultStatus" NOT NULL, "submitted_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "submitted_at" TIMESTAMPTZ(3), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "results_pkey" PRIMARY KEY ("result_id"),
  CONSTRAINT "results_task_scope_fkey" FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("task_id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "results_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "result_artifacts" (
  "result_id" TEXT NOT NULL, "artifact_id" TEXT NOT NULL,
  CONSTRAINT "result_artifacts_pkey" PRIMARY KEY ("result_id", "artifact_id"),
  CONSTRAINT "result_artifacts_result_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("result_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "result_artifacts_artifact_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("artifact_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
