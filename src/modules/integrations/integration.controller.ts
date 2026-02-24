import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { connectIntegration, disconnectIntegration, integrationStatus, listIntegrations } from './integration.service';

export const IntegrationController = {
  list: async (_request: FastifyRequest, reply: FastifyReply) => {
    const data = await listIntegrations();
    return reply.send(data);
  },
  connect: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const conn = await connectIntegration(request.user.organizationId, id);
    return reply.send(conn);
  },
  disconnect: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const conn = await disconnectIntegration(request.user.organizationId, id);
    return reply.send(conn);
  },
  status: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const data = await integrationStatus(request.user.organizationId);
    return reply.send(data);
  }
};
