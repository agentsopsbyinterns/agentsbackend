import { prisma } from '../../prisma/client';

export async function listProjects(orgId: string, skip: number, take: number) {
  const [items, total] = await Promise.all([
    (prisma as any).project.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { updatedAt: 'desc' }, skip, take }),
    (prisma as any).project.count({ where: { organizationId: orgId, deletedAt: null } })
  ]);
  return { items, total };
}

export async function getProject(orgId: string, id: string) {
  return (prisma as any).project.findFirst({ where: { id, organizationId: orgId } });
}

export async function listTasks(projectId: string) {
  return (prisma as any).projectTask.findMany({ where: { projectId } });
}

export async function projectMetrics(projectId: string) {
  const total = await (prisma as any).projectTask.count({ where: { projectId } });
  const done = await (prisma as any).projectTask.count({ where: { projectId, status: 'done' } });
  return { total, done };
}
