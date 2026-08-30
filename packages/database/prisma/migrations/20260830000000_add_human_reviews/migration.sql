CREATE TYPE "ReviewDecision" AS ENUM ('ACCEPT', 'REWORK');

ALTER TABLE "results"
  ADD COLUMN "submitted_by_user_id" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "results_submitted_by_user_id_fkey"
    FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "results_result_id_project_id_key"
    UNIQUE ("result_id", "project_id");

CREATE TABLE "reviews" (
  "review_id" TEXT NOT NULL,
  "result_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "reviewer_id" TEXT NOT NULL,
  "decision" "ReviewDecision" NOT NULL,
  "comment" TEXT,
  "reviewed_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("review_id"),
  CONSTRAINT "reviews_result_id_key" UNIQUE ("result_id"),
  CONSTRAINT "reviews_result_id_project_id_fkey"
    FOREIGN KEY ("result_id", "project_id") REFERENCES "results"("result_id", "project_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reviews_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("project_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reviews_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
