
import { FastifyInstance } from 'fastify';
import { MembersController } from './members.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { requireGlobalRole } from '../../common/middleware/rbac.middleware';

export async function membersRoutes(app: FastifyInstance) {
  app.get(
    '/projects/:projectId/members',
    { preHandler: [authMiddleware] },
    MembersController.getMembers
  );
  app.post(
    '/projects/:projectId/members',
    { preHandler: [authMiddleware, requireGlobalRole(['ADMIN'])] },
    MembersController.inviteMember
  );
  app.patch(
    '/projects/:projectId/members/:memberId',
    { preHandler: [authMiddleware, requireGlobalRole(['ADMIN'])] },
    MembersController.updateMemberRole
  );
  app.delete(
    '/projects/:projectId/members/:memberId',
    { preHandler: [authMiddleware, requireGlobalRole(['ADMIN'])] },
    MembersController.removeMember
  );
  app.get(
    '/accept-invite',
    MembersController.acceptProjectInvite
  );
}
