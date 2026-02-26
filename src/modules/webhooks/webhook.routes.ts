import { FastifyInstance } from 'fastify';
import { WebhookController } from './webhook.controller';

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/meeting_transcript_ready', WebhookController.transcriptReady);
  app.post('/webhooks/meeting_bot_joined', WebhookController.botJoined);
}
