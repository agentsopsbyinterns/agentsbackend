import { PrismaClient } from '@prisma/client';
import '../config/env.js';

if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST;
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT || '3306';
  if (host && name && user && pass) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);
    process.env.DATABASE_URL = `mysql://${u}:${p}@${host}:${port}/${name}`;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['warn', 'error']
  });

if (process.env.NODE_ENV !== 'production') {
  (globalForPrisma as any).prisma = prisma;
}
