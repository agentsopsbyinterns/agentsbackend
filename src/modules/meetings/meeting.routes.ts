import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware.js';
import { rbacMiddleware } from '../../common/middleware/rbac.middleware.js';
import { MeetingController } from './meeting.controller.js';

export async function meetingRoutes(app: FastifyInstance) {
  app.post('/meetings', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN', 'PROJECT_MANAGER'])] }, MeetingController.create);
  app.get('/meetings', { preHandler: [authMiddleware] }, MeetingController.list);
  app.get('/meetings/:id', { preHandler: [authMiddleware] }, MeetingController.get);
  app.get('/meetings/:id/tasks', { preHandler: [authMiddleware] }, MeetingController.tasks);
  app.patch('/api/meetings/:id/reschedule', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN','PROJECT_MANAGER'])] }, MeetingController.reschedule);
  app.post('/meetings/:id/invite-bot', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN', 'PROJECT_MANAGER'])] }, MeetingController.inviteBot);
  app.patch('/meetings/:id/expire', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN', 'PROJECT_MANAGER'])] }, MeetingController.expire);
  app.post('/meetings/:id/attendees', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN', 'PROJECT_MANAGER'])] }, MeetingController.addAttendee);
  app.get('/meetings/:id/timeline', { preHandler: [authMiddleware] }, MeetingController.timeline);
  app.get('/meetings/:id/transcript', { preHandler: [authMiddleware] }, MeetingController.transcript);
  app.get('/meetings/:id/insights', { preHandler: [authMiddleware] }, MeetingController.insights);
  app.post('/meetings/:id/review', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN', 'PROJECT_MANAGER'])] }, MeetingController.review);
  app.post('/meetings/:id/manual-transcript', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN', 'PROJECT_MANAGER'])] }, MeetingController.manualTranscript);
  app.post('/meetings/:id/upload-recording', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN', 'PROJECT_MANAGER'])] }, MeetingController.uploadRecording);
  app.delete('/meetings/:id', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN'])] }, MeetingController.remove);
  app.patch('/meetings/:id/action-items/:actionId', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN', 'PROJECT_MANAGER'])] }, MeetingController.updateActionItem);
}
