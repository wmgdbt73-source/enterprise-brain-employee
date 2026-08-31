CREATE TYPE "PermissionScopeType" AS ENUM ('ORGANIZATION', 'DEPARTMENT');
CREATE TYPE "PermissionResource" AS ENUM ('ORGANIZATION', 'DEPARTMENT', 'PERMISSION', 'RESULT');
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'MANAGE', 'ASSIGN', 'REVIEW');
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');
CREATE TABLE "permission_overrides" (
  "permission_override_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "scope_type" "PermissionScopeType" NOT NULL, "scope_id" TEXT NOT NULL CHECK (length(btrim("scope_id")) > 0),
  "resource" "PermissionResource" NOT NULL, "action" "PermissionAction" NOT NULL, "effect" "PermissionEffect" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "permission_overrides_pkey" PRIMARY KEY ("permission_override_id"),
  CONSTRAINT "permission_overrides_tuple_key" UNIQUE ("organization_id","user_id","scope_type","scope_id","resource","action"),
  CONSTRAINT "permission_overrides_org_user_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "organization_memberships"("organization_id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
