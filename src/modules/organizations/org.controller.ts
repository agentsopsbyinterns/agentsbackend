import { FastifyReply, FastifyRequest } from 'fastify';
import * as OrgService from './org.service';
import { createOrgSchema, inviteSchema, bulkInviteSchema } from './org.schema';
import { unauthorized } from '../../common/errors/api-error';
import { prisma } from '../../prisma/client';

export const OrgController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = createOrgSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const result = await OrgService.createOrganization(request.user.id, parsed.data);
    return reply.send(result);
    },
  invite: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const orgId = (request.params as any).id;
    const invite = await OrgService.createInvite(orgId, { email: parsed.data.email, inviterName: (request.user as any).name || request.user.email });
    return reply.send(invite);
  },
  inviteAlias: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = bulkInviteSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    let orgId = request.user.organizationId;
    if (!orgId) {
      const dbUser = await prisma.user.findUnique({ where: { id: request.user.id } });
      orgId = dbUser?.organizationId as string;
    }
    if (!orgId) {
      return reply.status(400).send({ error: 'Organization not found for user' });
    }
    const inviterName = (request.user as any).name || request.user.email;
    const results = [];
    for (const email of parsed.data.emails) {
      const res = await OrgService.createInvite(orgId, { email, inviterName });
      results.push({ email, id: res.id, status: res.status });
    }
    return reply.send({ invites: results });
  },
  acceptInvite: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = (request.query as any)?.token as string | undefined;
    if (!token) {
      return reply.status(400).send({ error: 'Missing token' });
    }
    const result = await OrgService.acceptOrgInvite(token);
    return reply.send({ success: true, organizationId: result.organizationId, email: result.email });
  }
};
