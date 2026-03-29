import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireProjectRole } from '../../common/middleware/rbac.middleware.js';
import { ProjectController } from './project.controller.js';

export async function projectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [authMiddleware] }, ProjectController.list);
  app.get('/my-projects', { preHandler: [authMiddleware] }, ProjectController.listMyProjects);
  app.post('/projects', { preHandler: [authMiddleware] }, ProjectController.create);
  app.get('/projects/:id', { preHandler: [authMiddleware] }, ProjectController.get);
  app.patch('/projects/:id', { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER'])] }, ProjectController.update);
  app.delete('/projects/:id', { preHandler: [authMiddleware, requireProjectRole(['ADMIN'])] }, ProjectController.remove);
  
  app.post('/projects/:id/merge/:meetingId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.mergeMeeting);
  app.post('/projects/:id/detect-changes', { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.detectTaskChanges);
  app.post('/projects/:id/archive', { preHandler: [authMiddleware, requireProjectRole(['ADMIN'])] }, ProjectController.archive);
  app.post('/projects/:id/sync-asana', { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.syncAsana);
  app.post('/projects/:id/generate-tasks', { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.generateTasks);
  app.get('/projects/:id/meetings', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER','CONTRIBUTOR'])] }, ProjectController.meetings);
  app.get('/projects/:id/tasks', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER','CONTRIBUTOR'])] }, ProjectController.tasks);
  app.get('/projects/:id/milestones', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER','CONTRIBUTOR'])] }, ProjectController.milestones);
  app.post('/projects/:id/milestones', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.createMilestone);
  app.patch('/projects/:id/milestones/:milestoneId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.updateMilestone);
  app.delete('/projects/:id/milestones/:milestoneId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER'])] }, ProjectController.deleteMilestone);
  app.get('/projects/:id/risks', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER','CONTRIBUTOR'])] }, ProjectController.risks);
  app.post('/projects/:id/risks', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.createRisk);
  app.patch('/projects/:id/risks/:riskId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.updateRisk);
  app.delete('/projects/:id/risks/:riskId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER'])] }, ProjectController.deleteRisk);
  app.get('/projects/:id/metrics', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER','CONTRIBUTOR'])] }, ProjectController.metrics);

  app.get('/projects/:id/integrations', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER','CONTRIBUTOR'])] }, ProjectController.integrations);
  app.post('/projects/:id/tasks', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.createTask);
  app.patch('/projects/:id/tasks/:taskId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.updateTask);
  app.delete('/projects/:id/tasks/:taskId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER'])] }, ProjectController.deleteTask);
  app.get('/projects/:id/budget', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER','CONTRIBUTOR'])] }, ProjectController.budget);
  app.patch('/projects/:id/budget', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER'])] }, ProjectController.updateBudget);
  app.post('/projects/:id/expenses', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.addExpense);
  app.get('/projects/:id/expenses', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER','CONTRIBUTOR'])] }, ProjectController.listExpenses);
  app.patch('/projects/:id/expenses/:expenseId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN','PROJECT_MANAGER', 'CONTRIBUTOR'])] }, ProjectController.updateExpense);
  app.delete('/projects/:id/expenses/:expenseId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER'])] }, ProjectController.deleteExpense);

  // API Keys
  app.get('/projects/:id/keys', { preHandler: [authMiddleware, requireProjectRole(['ADMIN'])] }, (ProjectController as any).listApiKeys);
  app.post('/projects/:id/keys', { preHandler: [authMiddleware, requireProjectRole(['ADMIN'])] }, (ProjectController as any).createApiKey);
  app.delete('/projects/:id/keys/:keyId', { preHandler: [authMiddleware, requireProjectRole(['ADMIN'])] }, (ProjectController as any).deleteApiKey);
}
