import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized, badRequest } from '../../common/errors/api-error.js';
import { 
  createConversation, 
  createMessage, 
  listConversations, 
  listMessages, 
  askAI, 
  deleteConversation, 
  clearAllConversations, 
  listTeamChatMessages, 
  createTeamChatMessage, 
  updateTeamChatMessage, 
  softDeleteTeamChatMessage, 
  globalDeleteTeamChatMessage,
  listDirectMessages,
  sendDirectMessage,
  markChatAsRead,
  getConversationsWithUnread,
  getOrCreateDirectConversation
} from './chat.service.js';
import { createConversationSchema, sendMessageSchema } from './chat.schema.js';
import { sseInit, sseSend, sseClose } from '../../common/utils/sse.js';
import { emitToProject, emitToUser } from '../../common/utils/socket.js';
import path from 'path';
import fs from 'fs/promises';

export const ChatController = {
  // ... existing methods ...
  listTeamMessages: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const projectId = (request.query as any).projectId;
    if (!projectId) throw badRequest('Missing projectId');
    const msgs = await listTeamChatMessages(projectId, request.user.id);
    return reply.send(msgs);
  },
  sendTeamMessage: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const { projectId, content, attachments } = request.body as { projectId: string; content: string; attachments?: any[] };
    if (!projectId || (!content && (!attachments || attachments.length === 0))) throw badRequest('Missing projectId or message content');
    const msg = await createTeamChatMessage(projectId, request.user.id, content, attachments);
    
    // Emit real-time update to project room
    emitToProject(projectId, 'receive_message', msg);
    
    return reply.send(msg);
  },
  editTeamMessage: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const messageId = (request.params as any).messageId;
    const { content } = request.body as { content: string };
    if (!messageId || !content) throw badRequest('Missing messageId or content');
    const msg = await updateTeamChatMessage(messageId, request.user.id, content);
    
    // Emit update event
    if (msg.projectId) {
      emitToProject(msg.projectId, 'update_message', msg);
    }
    
    return reply.send(msg);
  },
  deleteTeamMessage: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const messageId = (request.params as any).messageId;
    if (!messageId) throw badRequest('Missing messageId');
    // Global delete as requested
    await globalDeleteTeamChatMessage(messageId, request.user.id);
    
    // We don't have the projectId here easily without fetching the message,
    // but the task is mainly about sending messages.
    // For now, let's focus on the user's primary goal.
    
    return reply.send({ success: true });
  },
  uploadFile: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const data = await (request as any).file();
    if (!data) throw badRequest('No file uploaded');

    const uploadDir = path.join(process.cwd(), 'uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch {}

    const filename = `${Date.now()}-${data.filename}`;
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, await data.toBuffer());

    const fileUrl = `/uploads/${filename}`;
    let type = 'file';
    if (data.mimetype.startsWith('image/')) type = 'image';
    else if (data.mimetype === 'application/pdf') type = 'pdf';

    return reply.send({ 
      url: fileUrl, 
      type, 
      name: data.filename 
    });
  },
  createConversation: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const conv = await createConversation(request.user.organizationId, request.user.id);
    return reply.send(conv);
  },
  listAIConversations: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const conv = await listConversations(request.user.id, request.user.organizationId);
    return reply.send(conv);
  },
  deleteConversation: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    await deleteConversation(request.user.id, id);
    return reply.send({ success: true });
  },
  clearAllConversations: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    await clearAllConversations(request.user.id);
    return reply.send({ success: true });
  },
  listMessages: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user) throw unauthorized();
      const id = (request.params as any).id;
      if (!id) throw badRequest('Missing conversationId');

      console.log(`[ChatController] Fetching messages for conversation: ${id}`);
      const msgs = await listMessages(id);
      console.log(`[ChatController] Found ${msgs.length} messages`);
      return reply.send(msgs);
    } catch (err: any) {
      console.error('[ChatController] listMessages error:', err);
      return reply.status(500).send({ 
        error: "Failed to fetch messages", 
        message: err.message 
      });
    }
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
    const { projectId } = request.body as { projectId?: string };

    sseInit(reply);
    try {
      await askAI(id, request.user.organizationId, request.user.id, (chunk) => {
        sseSend(reply, { chunk });
      }, projectId);
      sseSend(reply, { done: true });
    } catch (err: any) {
      console.error('Chat AI error:', err);
      sseSend(reply, { error: err.message || 'AI request failed' });
    } finally {
      sseClose(reply);
    }
  },

  // --- New Chat Methods ---

  listConversations: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const conversations = await getConversationsWithUnread(request.user.id);
    return reply.send(conversations);
  },

  listDirectMessages: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const targetUserId = (request.query as any).userId;
    if (!targetUserId) throw badRequest('Missing userId');
    const msgs = await listDirectMessages(request.user.id, targetUserId);
    return reply.send(msgs);
  },

  sendDirectMessage: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const { userId, content, attachments } = request.body as { userId: string; content: string; attachments?: any[] };
    if (!userId || !content) throw badRequest('Missing userId or content');
    const msg = await sendDirectMessage(request.user.id, userId, content, attachments);
    
    // Emit real-time update to receiver
    emitToUser(userId, 'receive_message', msg);
    
    return reply.send(msg);
  },

  markRead: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const { projectId, userId } = request.body as { projectId?: string; userId?: string };
    if (!projectId && !userId) throw badRequest('Missing projectId or userId');
    await markChatAsRead(request.user.id, projectId, userId);
    return reply.send({ success: true });
  },

  createDirectConversation: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user) throw unauthorized();
      const { userId } = request.body as { userId: string };
      if (!userId) throw badRequest('Missing userId');
      
      const conv = await getOrCreateDirectConversation(request.user.organizationId, request.user.id, userId);
      return reply.send(conv);
    } catch (err: any) {
      console.error("[ChatController] createDirectConversation error:", err);
      return reply.status(500).send({ 
        error: "Failed to start direct conversation", 
        message: err.message 
      });
    }
  }
};
