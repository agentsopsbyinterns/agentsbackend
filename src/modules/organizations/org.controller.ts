import { FastifyReply, FastifyRequest } from 'fastify';
import { createOrganization, createInvite } from './org.service';
import { createOrgSchema, inviteSchema } from './org.schema';
import { unauthorized } from '../../common/errors/api-error';

export const OrgController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = createOrgSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const result = await createOrganization(request.user.id, parsed.data);
    return reply.send(result);
    },
  invite: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const orgId = (request.params as any).id;
    const invite = await createInvite(orgId, parsed.data);
    return reply.send(invite);
  }
};
