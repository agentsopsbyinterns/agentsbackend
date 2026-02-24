import { prisma } from '../../prisma/client';

export async function audit(organizationId: string, action: string, userId?: string, meta?: any) {
  await (prisma as any).auditLog.create({
    data: { organizationId, userId: userId || null, action, meta: meta || null }
  });
}
