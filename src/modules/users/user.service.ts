import { prisma } from '../../prisma/client';
type UserRole = 'ADMIN' | 'PM' | 'MEMBER';

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
  role?: UserRole;
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
