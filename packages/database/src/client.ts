import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

/**
 * Creates a Prisma 7 client with an explicit PostgreSQL driver adapter.
 * Lifecycle ownership (including $disconnect) remains with the caller.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  });
}
