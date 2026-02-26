import { prisma } from '../../prisma/client';

export async function listUserWorkspace(userId: string) {
  const memberships = await (prisma as any).projectMember.findMany({
    where: { userId },
    include: { project: true }
  });
  return memberships.map((m: any) => ({
    id: m.project.id,
    name: m.project.name,
    clientName: m.project.clientName ?? m.project.client ?? null,
    role: m.projectRole
  }));
}
