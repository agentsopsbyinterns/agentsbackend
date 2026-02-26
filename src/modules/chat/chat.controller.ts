import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { createConversation, createMessage, listConversations, listMessages } from './chat.service';
import { createConversationSchema, sendMessageSchema } from './chat.schema';
import { sseInit, sseSend, sseClose } from '../../common/utils/sse';

export const ChatController = {
  createConversation: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = createConversationSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const conv = await createConversation(request.user.organizationId, request.user.id);
    return reply.send(conv);
  },
  listConversations: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const conv = await listConversations(request.user.organizationId);
    return reply.send(conv);
  },
  listMessages: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const msgs = await listMessages(id);
    return reply.send(msgs);
  },
  sendMessage: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const msg = await createMessage(id, request.user.id, 'user', parsed.data.content);
    return reply.send(msg);
  },
  ask: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    sseInit(reply);
    let i = 0;
    const timer = setInterval(async () => {
      i++;
      sseSend(reply, { chunk: `message-${i}` });
      if (i === 5) {
        clearInterval(timer as any);
        await createMessage(id, null, 'assistant', 'done');
        sseSend(reply, { done: true });
        sseClose(reply);
      }
    }, 300);
  }
};
