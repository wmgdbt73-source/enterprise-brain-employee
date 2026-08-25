import type { User } from '@enterprise-brain/domain';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Idempotently persists the identity supplied by the application bootstrap. */
export async function ensureUser(
  prisma: PrismaClient,
  user: User
): Promise<void> {
  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      name: user.name,
      systemRole: user.systemRole,
      departmentId: user.departmentId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    },
    update: {
      name: user.name,
      systemRole: user.systemRole,
      departmentId: user.departmentId,
      updatedAt: user.updatedAt
    }
  });
}
