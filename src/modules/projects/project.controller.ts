import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { getPagination } from '../../common/utils/pagination';
import { createProject, deleteProject, getProject, listProjects, listProjectsForUser, listTasks, projectMetrics, updateProject, inviteTeamMember, updateProjectMemberRole, deleteProjectMember, createTask, updateTask, deleteTask, getBudget, setBudget, addExpense, listExpenses, updateExpense, deleteExpense, listProjectMeetings, mergeMeetingToProject, detectProjectTaskChanges, listProjectMembers, getProjectIntegrations, archiveProject, syncAsana, generateAITasks, listMilestones, createMilestone, updateMilestone, deleteMilestone, listRisks, createRisk, updateRisk, deleteRisk } from './project.service';

export const ProjectController = {
  mergeMeeting: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const meetingId = (request.params as any).meetingId;
    const result = await mergeMeetingToProject(request.user.organizationId, id, meetingId);
    return reply.send(result);
  },
  detectTaskChanges: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const body = request.body as any;
    const result = await detectProjectTaskChanges(id, body.updated_tasks || []);
    return reply.send(result);
  },
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const { skip, take, page, pageSize } = getPagination(request.query as any);
    const assignedToMeParam = (request.query as any)?.assignedToMe;
    const assignedToMe =
      assignedToMeParam === true ||
      assignedToMeParam === 'true' ||
      assignedToMeParam === '1';
    const role = (request.user as any).globalRole || request.user.role;
    const { items, total } = await listProjectsForUser(
      request.user.organizationId,
      request.user.id,
      role as any,
      skip,
      take,
      assignedToMe
    );
    return reply.send({ page, pageSize, total, items });
  },
  archive: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const p = await archiveProject(request.user.organizationId, id);
    return reply.send(p);
  },
  syncAsana: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const p = await syncAsana(request.user.organizationId, id);
    return reply.send(p);
  },
  generateTasks: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const tasks = await generateAITasks(request.user.organizationId, id);
    return reply.send(tasks);
  },
  members: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const result = await listProjectMembers(id);
    return reply.send(result);
  },
  integrations: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const result = await getProjectIntegrations(request.user.organizationId);
    return reply.send(result);
  },
  updateMemberRole: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const projectId = (request.params as any).id;
    const memberId = (request.params as any).memberId;
    const body = request.body as any;
    const result = await updateProjectMemberRole(projectId, memberId, body.role);
    return reply.send(result);
  },
  removeMember: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const projectId = (request.params as any).id;
    const memberId = (request.params as any).memberId;
    await deleteProjectMember(projectId, memberId);
    return reply.send({ success: true });
  },
  invite: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const body = request.body as any;
    const result = await inviteTeamMember(id, body.email, body.role);
    return reply.send(result);
  },
  get: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    // Ensure access by membership, not only creator
    const membership = await (require('../../prisma/client') as any).prisma.projectMember.findFirst({
      where: { projectId: id, userId: request.user.id }
    });
    const global = (request.user as any).globalRole || request.user.role;
    const hasGlobalAccess = global === 'ADMIN' || global === 'PROJECT_MANAGER';
    if (!hasGlobalAccess && !membership) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const p = await getProject(request.user.organizationId, id);
    if (!p) return reply.status(404).send({ error: 'Not found' });
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
  meetings: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const items = await listProjectMeetings(request.user.organizationId, id);
    return reply.send({ items });
  },
  createTask: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const body = request.body as any;
    const task = await createTask(
      id,
      body.title,
      body.assigneeUserId ?? body.assignee,
      body.dueDate,
      body.description,
      body.status,
      body.priority,
      body.meetingId
    );
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
  },
  milestones: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const items = await listMilestones(id);
    return reply.send({ items });
  },
  createMilestone: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const body = request.body as any;
    const item = await createMilestone(id, body.title, body.dueDate, body.status, body.progress);
    return reply.code(201).send(item);
  },
  updateMilestone: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).milestoneId;
    const body = request.body as any;
    const item = await updateMilestone(id, body.title, body.dueDate, body.status, body.progress);
    return reply.send(item);
  },
  deleteMilestone: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).milestoneId;
    await deleteMilestone(id);
    return reply.send({ success: true });
  },
  risks: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const items = await listRisks(id);
    return reply.send({ items });
  },
  createRisk: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const body = request.body as any;
    const item = await createRisk(id, body.title, body.description, body.severity, body.status);
    return reply.code(201).send(item);
  },
  updateRisk: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).riskId;
    const body = request.body as any;
    const item = await updateRisk(id, body.title, body.description, body.severity, body.status);
    return reply.send(item);
  },
  deleteRisk: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).riskId;
    await deleteRisk(id);
    return reply.send({ success: true });
  }
};
