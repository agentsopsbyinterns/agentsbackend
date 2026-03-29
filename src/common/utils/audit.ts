import { prisma } from '../../prisma/client.js';

export async function audit(organizationId: string, action: string, userId?: string, meta?: any) {
  const metaString = meta ? JSON.stringify(meta) : null;
  await prisma.auditLog.create({
    data: { organizationId, userId: userId || null, action, meta: metaString }
  });
}
