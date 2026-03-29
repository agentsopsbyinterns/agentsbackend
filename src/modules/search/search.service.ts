import { prisma } from '../../prisma/client.js';

export async function globalSearch(orgId: string, query: string) {
  if (!query) {
    return { projects: [], meetings: [] };
  }

  const [projects, meetings] = await Promise.all([
    (prisma as any).project.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { name: { contains: query } },
          { client: { contains: query } },
          { clientName: { contains: query } }
        ]
      },
      take: 5,
      select: {
        id: true,
        name: true,
        client: true,
        clientName: true
      }
    }),
    (prisma as any).meeting.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { title: { contains: query } },
          { agenda: { contains: query } }
        ]
      },
      take: 5,
      select: {
        id: true,
        title: true,
        scheduledTime: true
      }
    })
  ]);

  return {
    projects: projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.client || p.clientName || ''
    })),
    meetings: meetings.map((m: any) => ({
      id: m.id,
      title: m.title,
      date: m.scheduledTime
    }))
  };
}
