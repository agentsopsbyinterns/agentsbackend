import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { IntegrationController } from './integration.controller';

export async function integrationRoutes(app: FastifyInstance) {
  app.get('/integrations', IntegrationController.list);
  app.post('/integrations/:id/connect', { preHandler: [authMiddleware] }, IntegrationController.connect);
  app.post('/integrations/:id/disconnect', { preHandler: [authMiddleware] }, IntegrationController.disconnect);
  app.get('/integrations/status', { preHandler: [authMiddleware] }, IntegrationController.status);
}
