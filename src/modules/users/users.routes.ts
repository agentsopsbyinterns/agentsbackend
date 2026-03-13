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
}
