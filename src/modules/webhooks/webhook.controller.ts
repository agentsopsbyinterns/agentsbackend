import { FastifyReply, FastifyRequest } from 'fastify';
import { verifyHmacSignature } from '../../common/utils/hmac';
import { prisma } from '../../prisma/client';

async function handleEvent(request: FastifyRequest, reply: FastifyReply, type: string) {
  const signature = request.headers['x-signature'] as string | undefined;
  const payload = JSON.stringify(request.body || {});
  if (!signature || !verifyHmacSignature(payload, signature)) {
    return reply.status(401).send({ error: 'Invalid signature' });
  }
  await (prisma as any).webhookEvent.create({ data: { type, signature, payload: request.body as any } });
  return reply.send({ received: true });
}

export const WebhookController = {
  transcriptReady: async (request: FastifyRequest, reply: FastifyReply) => {
    return handleEvent(request, reply, 'meeting_transcript_ready');
  },
  botJoined: async (request: FastifyRequest, reply: FastifyReply) => {
    return handleEvent(request, reply, 'meeting_bot_joined');
  }
};
