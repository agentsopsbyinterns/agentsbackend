import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { getPagination } from '../../common/utils/pagination';
import { createProject, deleteProject, getProject, listProjects, listTasks, projectMetrics, updateProject, inviteTeamMember, acceptProjectInvite, createTask, updateTask, deleteTask, getBudget, setBudget, addExpense, listExpenses, updateExpense, deleteExpense } from './project.service';

export const ProjectController = {
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const { skip, take, page, pageSize } = getPagination(request.query as any);
    const { items, total } = await listProjects(request.user.organizationId, skip, take);
    return reply.send({ page, pageSize, total, items });
  },
  invite: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const body = request.body as any;
    const result = await inviteTeamMember(id, body.email, body.role);
    return reply.send(result);
  },
  acceptInvite: async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const result = await acceptProjectInvite(body.token, body.password);
    return reply.send(result);
  },
  get: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const p = await getProject(request.user.organizationId, id);
    return reply.send(p);
  },
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const body = request.body as any;
    const p = await createProject(request.user.organizationId, request.user.id, body);
    return reply.code(201).send(p);
  },
  update: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const existing = await getProject(request.user.organizationId, id);
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const body = request.body as any;
    const p = await updateProject(request.user.organizationId, id, body);
    return reply.send(p);
  },
  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const existing = await getProject(request.user.organizationId, id);
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await deleteProject(request.user.organizationId, id);
    return reply.send({ success: true });
  },
  tasks: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const t = await listTasks(id);
    return reply.send(t);
  },
  metrics: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const m = await projectMetrics(id);
    return reply.send(m);
  },
  createTask: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const body = request.body as any;
    const task = await createTask(id, body.title, body.assigneeUserId ?? body.assignee, body.dueDate, body.description, body.status, body.priority);
    return reply.code(201).send(task);
  },
  updateTask: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).taskId;
    const body = request.body as any;
    const task = await updateTask(id, body.title, body.status, body.assigneeUserId ?? body.assignee, body.dueDate, body.description, body.priority);
    return reply.send(task);
  },
  deleteTask: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).taskId;
    await deleteTask(id);
    return reply.send({ success: true });
  },
  budget: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const b = await getBudget(id);
    return reply.send(b);
  },
  updateBudget: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const body = request.body as any;
    const p = await setBudget(id, Number(body.amount));
    return reply.send(p);
  },
  addExpense: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const body = request.body as any;
    const e = await addExpense(id, { amount: Number(body.amount), description: body.description, category: body.category, incurredAt: body.incurredAt });
    return reply.code(201).send(e);
  },
  listExpenses: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const items = await listExpenses(id);
    return reply.send(items);
  },
  updateExpense: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const expenseId = (request.params as any).expenseId;
    const body = request.body as any;
    const e = await updateExpense(expenseId, { amount: body.amount !== undefined ? Number(body.amount) : undefined, description: body.description, category: body.category, incurredAt: body.incurredAt });
    return reply.send(e);
  },
  deleteExpense: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const expenseId = (request.params as any).expenseId;
    await deleteExpense(expenseId);
    return reply.send({ success: true });
  }
};
