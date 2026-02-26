import { prisma } from '../../prisma/client';

export async function listIntegrations() {
  const names = ['google-calendar', 'asana', 'deepgram', 'recall'];
  const existing = await (prisma as any).integration.findMany();
  type IntegrationRow = typeof existing[number];
  const map = new Map<string, IntegrationRow>(existing.map((i: IntegrationRow) => [i.name, i]));
  const toCreate = names.filter((n) => !map.has(n)).map((n) => ({ name: n }));
  if (toCreate.length) await (prisma as any).integration.createMany({ data: toCreate, skipDuplicates: true });
  return (prisma as any).integration.findMany();
}

export async function connectIntegration(orgId: string, id: string) {
  const integ = await (prisma as any).integration.findUnique({ where: { id } });
  if (!integ) return null;
  const conn = await (prisma as any).integrationConnection.upsert({
    where: { organizationId_integrationId: { organizationId: orgId, integrationId: id } },
    update: { status: 'connected' },
    create: { organizationId: orgId, integrationId: id, status: 'connected' }
  });
  return conn;
}

export async function disconnectIntegration(orgId: string, id: string) {
  return (prisma as any).integrationConnection.update({
    where: { organizationId_integrationId: { organizationId: orgId, integrationId: id } },
    data: { status: 'disconnected' }
  });
}

export async function integrationStatus(orgId: string) {
  return (prisma as any).integrationConnection.findMany({ where: { organizationId: orgId } });
}
