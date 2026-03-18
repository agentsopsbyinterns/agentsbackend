
import { FastifyInstance } from 'fastify';
import { MembersController } from './members.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';

export async function membersRoutes(app: FastifyInstance) {
  app.get(
    '/projects/:projectId/members',
    { preHandler: [authMiddleware] },
    MembersController.getMembers
  );
  app.post(
    '/projects/:projectId/members',
    { preHandler: [authMiddleware] },
    MembersController.inviteMember
  );
  app.patch(
    '/projects/:projectId/members/:memberId',
    { preHandler: [authMiddleware] },
    MembersController.updateMemberRole
  );
  app.delete(
    '/projects/:projectId/members/:memberId',
    { preHandler: [authMiddleware] },
    MembersController.removeMember
  );
  app.get(
    '/accept-invite',
    MembersController.acceptProjectInvite
  );
}
