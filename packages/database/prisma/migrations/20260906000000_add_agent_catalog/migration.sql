CREATE TYPE "AgentDefinitionStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "AgentVersionStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "AgentRuntimeProfile" AS ENUM ('READ_ONLY_WORK', 'CONFIRMED_WRITE_WORK');
CREATE TYPE "AgentAssignmentScopeType" AS ENUM ('ORGANIZATION', 'DEPARTMENT', 'USER');
CREATE TYPE "AgentAssignmentStatus" AS ENUM ('ACTIVE', 'DISABLED');
ALTER TYPE "PermissionResource" ADD VALUE IF NOT EXISTS 'AGENT';
ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'EXECUTE';
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "agent_version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "agent_definitions" (
  "agent_definition_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "status" "AgentDefinitionStatus" NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "agent_definitions_pkey" PRIMARY KEY ("agent_definition_id"),
  CONSTRAINT "agent_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_definitions_organization_id_key_key" UNIQUE ("organization_id", "key"),
  CONSTRAINT "agent_definitions_agent_definition_id_organization_id_key" UNIQUE ("agent_definition_id", "organization_id")
);
CREATE TABLE "agent_versions" (
  "agent_version_id" TEXT NOT NULL, "agent_definition_id" TEXT NOT NULL, "version" INTEGER NOT NULL, "runtime_profile" "AgentRuntimeProfile" NOT NULL,
  "status" "AgentVersionStatus" NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "agent_versions_pkey" PRIMARY KEY ("agent_version_id"),
  CONSTRAINT "agent_versions_agent_definition_id_fkey" FOREIGN KEY ("agent_definition_id") REFERENCES "agent_definitions"("agent_definition_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_versions_agent_definition_id_version_key" UNIQUE ("agent_definition_id", "version")
);
CREATE TABLE "agent_assignments" (
  "agent_assignment_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "agent_definition_id" TEXT NOT NULL,
  "scope_type" "AgentAssignmentScopeType" NOT NULL, "scope_id" TEXT NOT NULL, "status" "AgentAssignmentStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "agent_assignments_pkey" PRIMARY KEY ("agent_assignment_id"),
  CONSTRAINT "agent_assignments_definition_organization_fkey" FOREIGN KEY ("agent_definition_id", "organization_id") REFERENCES "agent_definitions"("agent_definition_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_assignments_tuple_key" UNIQUE ("organization_id", "agent_definition_id", "scope_type", "scope_id")
);
