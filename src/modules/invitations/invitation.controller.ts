import { FastifyReply, FastifyRequest } from 'fastify';
import { inviteTeamSchema } from './invitation.schema';
import { prisma } from '../../prisma/client';
import { generateRandomToken, sha256 } from '../../common/utils/tokens';
import { sendMail } from '../../common/utils/mailer';
import { env } from '../../config/env';
import { getRedis } from '../../config/redis';
import { unauthorized, badRequest } from '../../common/errors/api-error';

export const InvitationController = {
  invite: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = inviteTeamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed' });
    }
    const { emails } = parsed.data;
    const organizationId = request.user.organizationId;
    if (!organizationId) {
      throw badRequest('Missing organization');
    }
    const redis = getRedis();
    const results: Array<{ email: string; inviteId: string }> = [];
    for (const email of emails) {
      const invite = await prisma.invite.upsert({
        where: { organizationId_email: { organizationId, email } },
        update: { status: 'pending' },
        create: { organizationId, email, status: 'pending' },
      });
      const token = generateRandomToken(32);
      const tokenHash = sha256(token);
      if (redis) {
        await redis.setex(`orgInvite:${tokenHash}`, 60 * 60 * 24 * 7, JSON.stringify({ inviteId: invite.id, email, organizationId }));
      }
      const link = `${env.APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
      const html = `
        <div>
          <p>You have been invited to join the AgentOps workspace.</p>
          <p><a href="${link}">Accept your invite</a></p>
          <p>If the button does not work, copy and paste this link:</p>
          <p>${link}</p>
        </div>
      `;
      await sendMail({
        to: email,
        subject: 'You are invited to AgentOps',
        html,
      });
      results.push({ email, inviteId: invite.id });
    }
    return reply.send({ success: true, message: 'Invitations sent', invited: results.length });
  },
};
