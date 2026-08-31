import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bank_reconciliation?schema=public';
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export async function checkDatabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, message: 'Database connection operational' };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown database error';
    return { ok: false, message: `Database connection failed: ${errMessage}` };
  }
}
