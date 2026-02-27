import { FastifyInstance } from 'fastify';
import { InvitationController } from './invitation.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { rbacMiddleware } from '../../common/middleware/rbac.middleware';

export async function invitationRoutes(app: FastifyInstance) {
  app.post('/invitations/invite', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN'])] }, InvitationController.invite);
}
