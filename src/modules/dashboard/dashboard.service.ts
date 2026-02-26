import { prisma } from '../../prisma/client';

export async function getDashboard(orgId: string) {
  const [users, meetings, projects, actions] = await Promise.all([
    (prisma as any).user.count({ where: { organizationId: orgId } }),
    (prisma as any).meeting.count({ where: { organizationId: orgId, deletedAt: null } }),
    (prisma as any).project.count({ where: { organizationId: orgId, deletedAt: null } }),
    (prisma as any).actionItem.count({ where: { meeting: { organizationId: orgId } } })
  ]);
  return { users, meetings, projects, actionItems: actions };
}
