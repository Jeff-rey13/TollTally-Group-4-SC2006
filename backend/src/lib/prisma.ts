import { PrismaClient } from '@prisma/client';

/**
 * Creates the Prisma database client.
 * @param databaseUrl optional override of DATABASE_URL (tests use a separate SQLite file)
 */
export function createPrisma(databaseUrl?: string): PrismaClient {
  return new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);
}
