import { prisma } from '../../prisma/client.js';

export async function getDashboard(orgId: string, userId: string) {
  const projectMembership = { members: { some: { userId } } };
  const [users, meetings, projects, actions] = await Promise.all([
    (prisma as any).user.count({ where: { organizationId: orgId } }),
    (prisma as any).meeting.count({ where: { organizationId: orgId, deletedAt: null, project: projectMembership } }),
    (prisma as any).project.count({ where: { organizationId: orgId, deletedAt: null, ...projectMembership } }),
    (prisma as any).actionItem.count({ where: { meeting: { organizationId: orgId, project: projectMembership } } })
  ]);
  return { users, meetings, projects, actionItems: actions };
}
