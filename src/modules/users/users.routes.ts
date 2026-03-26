import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma/client';

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.get('/api/users', async (request, reply) => {
    try {
      const users = await prisma.user.findMany();
      return users;
    } catch (error) {
      reply.status(500).send({ message: 'Failed to fetch users' });
    }
  });

  fastify.post('/user/complete-onboarding', async (request, reply) => {
    // For now, just return success since schema doesn't have an onboarding status field yet.
    // In a real app, we would update the user record here.
    return { success: true };
  });
}
