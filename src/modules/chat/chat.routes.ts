import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { ChatController } from './chat.controller';

export async function chatRoutes(app: FastifyInstance) {
  app.post('/conversations', { preHandler: [authMiddleware] }, ChatController.createConversation);
  app.get('/conversations', { preHandler: [authMiddleware] }, ChatController.listConversations);
  app.get('/conversations/:id/messages', { preHandler: [authMiddleware] }, ChatController.listMessages);
  app.post('/conversations/:id/messages', { preHandler: [authMiddleware] }, ChatController.sendMessage);
  app.post('/conversations/:id/ask', { preHandler: [authMiddleware] }, ChatController.ask);
}
