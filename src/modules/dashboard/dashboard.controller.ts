import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { getDashboard } from './dashboard.service';

export const DashboardController = {
  get: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const data = await getDashboard(request.user.organizationId);
    return reply.send(data);
  }
};
