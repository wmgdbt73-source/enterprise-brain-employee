import { randomUUID } from 'node:crypto';
import { createPrismaClient } from './client.js';
import { encodePassword, normalizeLogin } from './auth/password.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for demo seed');
const db = createPrismaClient(url);
const now = new Date();
// Development-only credentials. Do not run this command against production data.
const accounts = [
  { id: 'demo-employee', name: 'Demo Employee', login: 'employee@example.test', password: 'DemoEmployee!2026', systemRole: 'EMPLOYEE' as const },
  { id: 'demo-reviewer', name: 'Demo Reviewer', login: 'reviewer@example.test', password: 'DemoReviewer!2026', systemRole: 'EMPLOYEE' as const },
  { id: 'demo-admin', name: 'Demo Admin', login: 'admin@example.test', password: 'DemoAdmin!2026', systemRole: 'ADMIN' as const }
];
for (const item of accounts) {
  const passwordHash = await encodePassword(item.password);
  const user = await db.user.upsert({ where: { id: item.id }, create: { id: item.id, name: item.name, systemRole: item.systemRole, createdAt: now, updatedAt: now }, update: { name: item.name, systemRole: item.systemRole, updatedAt: now } });
  await db.account.upsert({ where: { userId: user.id }, create: { id: randomUUID(), userId: user.id, login: normalizeLogin(item.login)!, passwordHash, status: 'ACTIVE', createdAt: now, updatedAt: now }, update: { login: normalizeLogin(item.login)!, passwordHash, status: 'ACTIVE', updatedAt: now } });
}
await db.organization.upsert({ where: { id: 'enterprise-brain-demo' }, create: { id: 'enterprise-brain-demo', name: 'Enterprise Brain Demo', status: 'ACTIVE', createdAt: now, updatedAt: now }, update: { name: 'Enterprise Brain Demo', status: 'ACTIVE', updatedAt: now } });
for (const item of [
  { id: 'demo-org-admin', userId: 'demo-admin', role: 'OWNER' as const },
  { id: 'demo-org-employee', userId: 'demo-employee', role: 'MEMBER' as const },
  { id: 'demo-org-reviewer', userId: 'demo-reviewer', role: 'MEMBER' as const }
]) await db.organizationMembership.upsert({ where: { userId: item.userId }, create: { ...item, organizationId: 'enterprise-brain-demo', status: 'ACTIVE', createdAt: now, updatedAt: now }, update: { role: item.role, status: 'ACTIVE', updatedAt: now } });
for (const item of [{ id: 'demo-department-product', name: 'Product' }, { id: 'demo-department-research', name: 'Research' }]) await db.department.upsert({ where: { id: item.id }, create: { ...item, organizationId: 'enterprise-brain-demo', status: 'ACTIVE', createdAt: now, updatedAt: now }, update: { name: item.name, status: 'ACTIVE', updatedAt: now } });
for (const item of [
  { id: 'demo-department-employee', userId: 'demo-employee', departmentId: 'demo-department-product', role: 'MEMBER' as const },
  { id: 'demo-department-reviewer', userId: 'demo-reviewer', departmentId: 'demo-department-research', role: 'MEMBER' as const }
]) await db.departmentMembership.upsert({ where: { userId: item.userId }, create: { ...item, organizationId: 'enterprise-brain-demo', status: 'ACTIVE', createdAt: now, updatedAt: now }, update: { departmentId: item.departmentId, role: item.role, status: 'ACTIVE', updatedAt: now } });
// A shared, review-capable project. The employee can submit a Result and the
// separate reviewer account can accept or request rework through public APIs.
await db.project.upsert({
  where: { id: 'demo-review-project' },
  create: { id: 'demo-review-project', name: 'Demo Review Project', goal: 'Exercise the employee to reviewer flow', status: 'ACTIVE', createdAt: now, updatedAt: now },
  update: { name: 'Demo Review Project', goal: 'Exercise the employee to reviewer flow', status: 'ACTIVE', updatedAt: now }
});
for (const member of [
  { id: 'demo-review-project-employee', userId: 'demo-employee', role: 'OWNER' as const },
  { id: 'demo-review-project-reviewer', userId: 'demo-reviewer', role: 'REVIEWER' as const }
]) {
  await db.projectMember.upsert({
    where: { projectId_userId: { projectId: 'demo-review-project', userId: member.userId } },
    create: { ...member, projectId: 'demo-review-project', createdAt: now, updatedAt: now },
    update: { role: member.role, updatedAt: now }
  });
}
// Catalog entries are organization-owned; assignments, not client-side keys,
// determine which demo employee may initiate a new run.
for (const item of [
  { id: 'demo-agent-research', key: 'research-agent', name: 'Research Agent', runtimeProfile: 'READ_ONLY_WORK' as const },
  { id: 'demo-agent-file-writer', key: 'file-writer-agent', name: 'File Writer Agent', runtimeProfile: 'CONFIRMED_WRITE_WORK' as const }
]) {
  await db.agentDefinition.upsert({ where: { id: item.id }, create: { id: item.id, organizationId: 'enterprise-brain-demo', key: item.key, name: item.name, status: 'ACTIVE', createdAt: now, updatedAt: now }, update: { key: item.key, name: item.name, status: 'ACTIVE', updatedAt: now } });
  await db.agentVersion.upsert({ where: { agentDefinitionId_version: { agentDefinitionId: item.id, version: 1 } }, create: { id: `${item.id}-v1`, agentDefinitionId: item.id, version: 1, runtimeProfile: item.runtimeProfile, status: 'ACTIVE', createdAt: now }, update: { runtimeProfile: item.runtimeProfile, status: 'ACTIVE' } });
}
for (const item of [
  { id: 'demo-agent-research-org', agentDefinitionId: 'demo-agent-research', scopeType: 'ORGANIZATION' as const, scopeId: 'enterprise-brain-demo' },
  { id: 'demo-agent-writer-employee', agentDefinitionId: 'demo-agent-file-writer', scopeType: 'USER' as const, scopeId: 'demo-employee' }
]) await db.agentAssignment.upsert({ where: { organizationId_agentDefinitionId_scopeType_scopeId: { organizationId: 'enterprise-brain-demo', agentDefinitionId: item.agentDefinitionId, scopeType: item.scopeType, scopeId: item.scopeId } }, create: { ...item, organizationId: 'enterprise-brain-demo', status: 'ACTIVE', createdAt: now, updatedAt: now }, update: { status: 'ACTIVE', updatedAt: now } });
await db.$disconnect();
