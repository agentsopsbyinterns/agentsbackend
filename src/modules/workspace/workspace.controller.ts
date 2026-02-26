import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { listUserWorkspace } from './workspace.service.js';

export const WorkspaceController = {
  get: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const data = await listUserWorkspace(request.user.id);
    return reply.send({ projects: data });
  }
};
