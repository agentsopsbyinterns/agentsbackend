import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware.js';
import { ChatController } from './chat.controller.js';

export async function chatRoutes(app: FastifyInstance) {
  // Team Chat routes
  app.get('/messages', { preHandler: [authMiddleware] }, ChatController.listTeamMessages);
  app.post('/messages', { preHandler: [authMiddleware] }, ChatController.sendTeamMessage);
  app.put('/messages/:messageId', { preHandler: [authMiddleware] }, ChatController.editTeamMessage);
  app.delete('/messages/:messageId', { preHandler: [authMiddleware] }, ChatController.deleteTeamMessage);
  app.post('/upload', { preHandler: [authMiddleware] }, ChatController.uploadFile);

  // AI Chat routes
  app.post('/conversations', { preHandler: [authMiddleware] }, ChatController.createConversation);
  app.get('/conversations', { preHandler: [authMiddleware] }, ChatController.listConversations);
  app.delete('/conversations', { preHandler: [authMiddleware] }, ChatController.clearAllConversations);
  app.delete('/conversations/:id', { preHandler: [authMiddleware] }, ChatController.deleteConversation);
  app.get('/conversations/:id/messages', { preHandler: [authMiddleware] }, ChatController.listMessages);
  app.post('/conversations/:id/messages', { preHandler: [authMiddleware] }, ChatController.sendMessage);
  app.post('/conversations/:id/ask', { preHandler: [authMiddleware] }, ChatController.ask);
}
