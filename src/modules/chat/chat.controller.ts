import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error.js';
import { createConversation, createMessage, listConversations, listMessages, askAI } from './chat.service.js';
import { createConversationSchema, sendMessageSchema } from './chat.schema.js';
import { sseInit, sseSend, sseClose } from '../../common/utils/sse.js';

export const ChatController = {
  createConversation: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
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
    try {
      await askAI(id, request.user.organizationId, (chunk) => {
        sseSend(reply, { chunk });
      });
      sseSend(reply, { done: true });
    } catch (err: any) {
      console.error('Chat AI error:', err);
      sseSend(reply, { error: err.message || 'AI request failed' });
    } finally {
      sseClose(reply);
    }
  }
};
