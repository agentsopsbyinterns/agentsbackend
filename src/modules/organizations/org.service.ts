import { prisma } from '../../prisma/client';

export async function createOrganization(name: string) {
  return prisma.organization.create({
    data: { name }
  });
}

export async function getOrganizationById(id: string) {
  return prisma.organization.findUnique({ where: { id } });
}
