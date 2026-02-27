import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { requireProjectRole } from '../../common/middleware/rbac.middleware';
import { ProjectController } from './project.controller';

export async function projectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [authMiddleware] }, ProjectController.list);
  app.get('/projects/:id', { preHandler: [authMiddleware] }, ProjectController.get);
  app.get('/projects/:id/tasks', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR','VIEWER'])] }, ProjectController.tasks);
  app.get('/projects/:id/metrics', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR','VIEWER'])] }, ProjectController.metrics);
  app.post('/projects', { preHandler: [authMiddleware] }, ProjectController.create);
  app.put('/projects/:id', { preHandler: [authMiddleware] }, ProjectController.update);
  app.delete('/projects/:id', { preHandler: [authMiddleware] }, ProjectController.remove);
  app.post('/projects/:id/invite', { preHandler: [authMiddleware] }, ProjectController.invite);
  app.post('/accept-invite', ProjectController.acceptInvite);
  app.post('/projects/:id/tasks', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR'])] }, ProjectController.createTask);
  app.patch('/projects/:id/tasks/:taskId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR'])] }, ProjectController.updateTask);
  app.delete('/projects/:id/tasks/:taskId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR'])] }, ProjectController.deleteTask);
  app.get('/projects/:id/budget', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR','VIEWER'])] }, ProjectController.budget);
  app.patch('/projects/:id/budget', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR'])] }, ProjectController.updateBudget);
  app.post('/projects/:id/expenses', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR'])] }, ProjectController.addExpense);
  app.get('/projects/:id/expenses', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR','VIEWER'])] }, ProjectController.listExpenses);
  app.patch('/projects/:id/expenses/:expenseId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR'])] }, ProjectController.updateExpense);
  app.delete('/projects/:id/expenses/:expenseId', { preHandler: [authMiddleware, requireProjectRole(['OWNER','EDITOR'])] }, ProjectController.deleteExpense);
}
