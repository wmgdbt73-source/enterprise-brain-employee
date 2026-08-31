CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "OrganizationMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "OrganizationMembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "DepartmentMembershipRole" AS ENUM ('MANAGER', 'MEMBER');
CREATE TYPE "DepartmentMembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "organizations" (
  "organization_id" TEXT NOT NULL, "name" TEXT NOT NULL, "status" "OrganizationStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("organization_id")
);
CREATE TABLE "organization_memberships" (
  "organization_membership_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "role" "OrganizationMembershipRole" NOT NULL, "status" "OrganizationMembershipStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("organization_membership_id"),
  CONSTRAINT "organization_memberships_organization_id_user_id_key" UNIQUE ("organization_id", "user_id"),
  CONSTRAINT "organization_memberships_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "departments" (
  "department_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" "DepartmentStatus" NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("department_id"),
  CONSTRAINT "departments_organization_id_name_key" UNIQUE ("organization_id", "name"),
  CONSTRAINT "departments_department_id_organization_id_key" UNIQUE ("department_id", "organization_id"),
  CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "department_memberships" (
  "department_membership_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "department_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "role" "DepartmentMembershipRole" NOT NULL, "status" "DepartmentMembershipStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "department_memberships_pkey" PRIMARY KEY ("department_membership_id"),
  CONSTRAINT "department_memberships_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "department_memberships_organization_id_user_id_key" UNIQUE ("organization_id", "user_id"),
  CONSTRAINT "department_memberships_organization_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "organization_memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "department_memberships_department_org_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "departments"("department_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "users" DROP COLUMN "department_id";
