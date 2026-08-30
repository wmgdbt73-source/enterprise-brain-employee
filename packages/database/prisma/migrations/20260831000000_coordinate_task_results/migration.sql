ALTER TABLE "task_dependencies" ADD COLUMN "project_id" TEXT;
UPDATE "task_dependencies" AS dependency
SET "project_id" = task."project_id"
FROM "tasks" AS task
WHERE task."task_id" = dependency."task_id";
ALTER TABLE "task_dependencies" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "task_dependencies" DROP CONSTRAINT "task_dependencies_task_id_fkey";
ALTER TABLE "task_dependencies" DROP CONSTRAINT "task_dependencies_depends_on_task_id_fkey";
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_project_id_fkey"
FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("task_id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_project_id_fkey"
FOREIGN KEY ("depends_on_task_id", "project_id") REFERENCES "tasks"("task_id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
