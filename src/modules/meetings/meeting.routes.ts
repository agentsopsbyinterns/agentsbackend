import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { rbacMiddleware } from '../../common/middleware/rbac.middleware';
import { MeetingController } from './meeting.controller';

export async function meetingRoutes(app: FastifyInstance) {
  app.post('/meetings', { preHandler: [authMiddleware] }, MeetingController.create);
  app.get('/meetings', { preHandler: [authMiddleware] }, MeetingController.list);
  app.get('/meetings/:id', { preHandler: [authMiddleware] }, MeetingController.get);
  app.get('/meetings/:id/tasks', { preHandler: [authMiddleware] }, MeetingController.tasks);
  app.patch('/api/meetings/:id/reschedule', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN','PROJECT_MANAGER'])] }, MeetingController.reschedule);
  app.post('/meetings/:id/invite-bot', { preHandler: [authMiddleware] }, MeetingController.inviteBot);
  app.get('/meetings/:id/timeline', { preHandler: [authMiddleware] }, MeetingController.timeline);
  app.get('/meetings/:id/transcript', { preHandler: [authMiddleware] }, MeetingController.transcript);
  app.get('/meetings/:id/insights', { preHandler: [authMiddleware] }, MeetingController.insights);
  app.post('/meetings/:id/review', { preHandler: [authMiddleware] }, MeetingController.review);
  app.post('/meetings/:id/manual-transcript', { preHandler: [authMiddleware] }, MeetingController.manualTranscript);
  app.post('/meetings/:id/upload-recording', { preHandler: [authMiddleware] }, MeetingController.uploadRecording);
  app.delete('/meetings/:id', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN','PROJECT_MANAGER'])] }, MeetingController.remove);
  app.patch('/meetings/:id/action-items/:actionId', { preHandler: [authMiddleware] }, MeetingController.updateActionItem);
}
