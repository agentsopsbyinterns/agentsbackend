import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { requireProjectRole } from '../../common/middleware/rbac.middleware';
import { ProjectController } from './project.controller';

export async function projectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [authMiddleware] }, ProjectController.list);
  app.post('/projects', { preHandler: [authMiddleware] }, ProjectController.create);
  app.get('/projects/:id', { preHandler: [authMiddleware] }, ProjectController.get);
  app.patch('/projects/:id', { preHandler: [authMiddleware, requireProjectRole(['OWNER', 'CONTRIBUTOR'])] }, ProjectController.update);
  app.delete('/projects/:id', { preHandler: [authMiddleware, requireProjectRole(['OWNER'])] }, ProjectController.remove);
  
  app.post('/projects/:id/merge/:meetingId', { preHandler: [authMiddleware, requireProjectRole(['OWNER', 'CONTRIBUTOR'])] }, ProjectController.mergeMeeting);
  app.post('/projects/:id/detect-changes', { preHandler: [authMiddleware, requireProjectRole(['OWNER', 'CONTRIBUTOR'])] }, ProjectController.detectTaskChanges);
  app.post('/projects/:id/archive', { preHandler: [authMiddleware, requireProjectRole(['OWNER'])] }, ProjectController.archive);
  app.post('/projects/:id/sync-asana', { preHandler: [authMiddleware, requireProjectRole(['OWNER', 'CONTRIBUTOR'])] }, ProjectController.syncAsana);
  app.post('/projects/:id/generate-tasks', { preHandler: [authMiddleware, requireProjectRole(['OWNER', 'CONTRIBUTOR'])] }, ProjectController.generateTasks);
  app.get('/projects/:id/meetings', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR','VIEWER'])] }, ProjectController.meetings);
  app.get('/projects/:id/tasks', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR','VIEWER'])] }, ProjectController.tasks);
  app.get('/projects/:id/milestones', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR','VIEWER'])] }, ProjectController.milestones);
  app.post('/projects/:id/milestones', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.createMilestone);
  app.patch('/projects/:id/milestones/:milestoneId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.updateMilestone);
  app.delete('/projects/:id/milestones/:milestoneId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.deleteMilestone);
  app.get('/projects/:id/risks', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR','VIEWER'])] }, ProjectController.risks);
  app.post('/projects/:id/risks', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.createRisk);
  app.patch('/projects/:id/risks/:riskId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.updateRisk);
  app.delete('/projects/:id/risks/:riskId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.deleteRisk);
  app.get('/projects/:id/metrics', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR','VIEWER'])] }, ProjectController.metrics);

  app.get('/projects/:id/integrations', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR','VIEWER'])] }, ProjectController.integrations);
  app.post('/projects/:id/tasks', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.createTask);
  app.patch('/projects/:id/tasks/:taskId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.updateTask);
  app.delete('/projects/:id/tasks/:taskId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.deleteTask);
  app.get('/projects/:id/budget', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR','VIEWER'])] }, ProjectController.budget);
  app.patch('/projects/:id/budget', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.updateBudget);
  app.post('/projects/:id/expenses', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.addExpense);
  app.get('/projects/:id/expenses', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR','VIEWER'])] }, ProjectController.listExpenses);
  app.patch('/projects/:id/expenses/:expenseId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.updateExpense);
  app.delete('/projects/:id/expenses/:expenseId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','CONTRIBUTOR'])] }, ProjectController.deleteExpense);
}
