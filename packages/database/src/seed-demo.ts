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
await db.$disconnect();
