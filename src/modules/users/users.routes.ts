import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma/client.js';
import { authMiddleware } from '../../common/middleware/auth.middleware.js';

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.get('/api/users', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const organizationId = request.organizationId;
      const currentUserId = request.user?.id;

      console.log(`[UsersAPI] Fetching users for org: ${organizationId}, currentUserId: ${currentUserId}`);

      if (!organizationId) {
        console.warn('[UsersAPI] No organizationId found in request');
        return [];
      }

      const users = await prisma.user.findMany({
        where: {
          organizationId: organizationId,
          id: { not: currentUserId }
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      });

      console.log(`[UsersAPI] Found ${users.length} users`);
      return users;
    } catch (error) {
      console.error('[UsersAPI] Failed to fetch users:', error);
      reply.status(500).send({ message: 'Failed to fetch users' });
    }
  });

  fastify.post('/user/complete-onboarding', async (request, reply) => {
    // For now, just return success since schema doesn't have an onboarding status field yet.
    // In a real app, we would update the user record here.
    return { success: true };
  });
}
