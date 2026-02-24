import { prisma } from '../../prisma/client';
import { Role } from '@prisma/client';

export async function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function findById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  organizationId: string;
  role?: Role;
}) {
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      organizationId: input.organizationId,
      role: input.role ?? 'ADMIN'
    }
  });
}
