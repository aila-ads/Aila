import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let client: PrismaClient | undefined;

/**
 * Returns the shared Prisma client, created on first use so DATABASE_URL is
 * read at runtime only and never needed by `next build`.
 */
export function getDb(): PrismaClient {
  if (client) {
    return client;
  }

  if (globalForPrisma.prisma) {
    client = globalForPrisma.prisma;
    return client;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
    }),
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }

  return client;
}

export { PrismaClient } from '@prisma/client';
