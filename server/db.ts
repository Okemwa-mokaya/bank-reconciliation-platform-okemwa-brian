import { PrismaClient } from '@prisma/client';

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

/**
 * Validates the active PostgreSQL database connection without leaking connection credentials.
 */
export async function checkDatabaseConnection(): Promise<{ ok: boolean; message: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === '') {
    return {
      ok: false,
      message: 'DATABASE_URL environment variable is missing or empty. Please configure a valid PostgreSQL connection string in your environment.',
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, message: 'PostgreSQL database connection operational' };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Unknown database error';
    // Sanitize any potential credential strings from error logs (user:password@host)
    const sanitized = rawMessage.replace(/:\/\/[^@]+@/g, '://[REDACTED]@');
    return { ok: false, message: `Database connection failed: ${sanitized}` };
  }
}
