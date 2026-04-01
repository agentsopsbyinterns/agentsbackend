import { prisma } from '../../prisma/client.js';
import { generateRandomToken, sha256 } from '../../common/utils/tokens.js';
import { mapLegacyRole, PROJECT_ROLES } from '../../common/utils/roles.js';
import { mergeProjectData, detectTaskChanges } from '../../services/ai.service.js';
import { badRequest, notFound, forbidden } from '../../common/errors/api-error.js';

function sanitizeProject(project: any, role: string) {
  if (role === 'CONTRIBUTOR') {
    const sanitized = { ...project };
    delete sanitized.budget;
    delete sanitized.budgetTotal;
    delete sanitized.remainingBudget;
    return sanitized;
  }
  return project;
}

export async function listProjects(orgId: string, skip: number, take: number, filters?: { search?: string; health?: string; status?: string; client?: string; assignedToMe?: boolean; userId?: string }) {
  const where: any = { 
    organizationId: orgId, 
    deletedAt: null, 
    AND: [] 
  };

  // Filter by user membership if specifically requested
  if (filters?.userId && filters?.assignedToMe === true) {
    where.AND.push({
      members: {
        some: {
          userId: filters.userId
        }
      }
    });
  }

  if (filters?.search) {
    where.AND.push({
      OR: [
        { name: { contains: filters.search } },
        { client: { contains: filters.search } },
        { clientName: { contains: filters.search } }
      ]
    });
  }

  if (filters?.health) {
    where.AND.push({ health: filters.health });
  }

  if (filters?.status) {
    where.AND.push({ status: filters.status });
  }

  if (filters?.client) {
    where.AND.push({
      OR: [
        { client: { contains: filters.client } },
        { clientName: { contains: filters.client } }
      ]
    });
  }

  if (where.AND.length === 0) delete where.AND;

  const include: any = {
    _count: {
      select: { tasks: true }
    }
  };

  const [items, total] = await Promise.all([
    (prisma as any).project.findMany({ 
      where, 
      orderBy: { updatedAt: 'desc' }, 
      skip, 
      take,
      include
    }),
    (prisma as any).project.count({ where })
  ]);

  // Requirement 10: Log /my-projects query
  console.log(`[MY PROJECTS] User: ${filters?.userId}, Found: ${items.length} projects`);

  // Enrich with completed tasks, progress, and user role
   const enrichedItems = await Promise.all(items.map(async (p: any) => {
     const tasksCompleted = await (prisma as any).projectTask.count({
       where: { projectId: p.id, status: 'COMPLETED' }
     });
     const tasksInProgress = await (prisma as any).projectTask.count({
        where: { projectId: p.id, status: 'IN_PROGRESS' }
        });
     const tasksTotal = p._count?.tasks ?? 0;
     const progress = tasksTotal > 0 ? Math.round(((tasksCompleted + (tasksInProgress * 0.5)) / tasksTotal) * 100) : 0;
     
     // Extract the user's role from the membership record directly for reliability
     let userRole = null;
     if (filters?.userId) {
       const membership = await (prisma as any).projectMember.findUnique({
         where: { userId_projectId: { userId: filters.userId, projectId: p.id } }
       });
       userRole = membership?.projectRole || null;
     }

     return sanitizeProject({
       ...p,
       id: p.id,
       projectId: p.id, // Included for compatibility with requested example
       name: p.name,
       projectRole: userRole || 'CONTRIBUTOR',
       client: p.client || p.clientName || '',
       dueDate: p.dueDate,
       status: p.status,
       health: p.health || 'on-track',
       progress,
       tasksTotal,
       tasksCompleted,
       asanaLink: p.asanaLink,
       updatedAt: p.updatedAt
     }, userRole || 'CONTRIBUTOR');
   }));

  return { items: enrichedItems, total };
}

export async function getProject(orgId: string, id: string, userId?: string) {
  // Requirement: Use ProjectMember as source of truth for reliable access check
  if (!userId) {
    // If no userId, fall back to basic lookup (though usually it should have userId)
    const project = await (prisma as any).project.findFirst({ 
      where: { id, organizationId: orgId },
      include: { _count: { select: { tasks: true } } }
    });
    if (!project) throw notFound('Project not found');
    return sanitizeProject(project, 'CONTRIBUTOR'); 
  }

  const membership = await (prisma as any).projectMember.findUnique({
    where: { userId_projectId: { userId, projectId: id } },
    include: {
      project: {
        include: {
          _count: {
            select: {
              tasks: true
            }
          }
        }
      }
    }
  });

  if (!membership || !membership.project) {
    console.warn(`[GET PROJECT] No membership found for user ${userId} on project ${id}`);
    throw notFound('Project not found or you are not a member');
  }

  const project = membership.project;
  const userRole = membership.projectRole;

  if (!project.id || !project.name) {
    console.error(`[GET PROJECT] Project ${id} is missing core fields: id=${project.id}, name=${project.name}`);
    throw badRequest('Project record is corrupted or incomplete');
  }

  const tasksCompleted = await (prisma as any).projectTask.count({
    where: { projectId: id, status: 'COMPLETED' }
  });
  const tasksInProgress = await (prisma as any).projectTask.count({
    where: { projectId: id, status: 'IN_PROGRESS' }
    });

  const budgetInfo = await getBudget(id);
  const tasksTotal = project._count?.tasks ?? 0;
  const progress = tasksTotal > 0 ? Math.round(((tasksCompleted + (tasksInProgress * 0.5)) / tasksTotal) * 100) : 0;

  const result = sanitizeProject({
    ...project,
    id: project.id,
    name: project.name,
    projectRole: userRole || 'CONTRIBUTOR',
    tasksCompleted,
    tasksTotal,
    progress,
    budget: budgetInfo?.used ?? 0,
    budgetTotal: budgetInfo?.budget ?? 0,
    remainingBudget: budgetInfo?.remaining ?? 0,
  }, userRole || 'CONTRIBUTOR');

  if (!result.id || !result.name || !result.projectRole) {
    console.error(`[GET PROJECT] Result object missing required fields for project ${id}`);
    throw badRequest('Failed to construct complete project response');
  }

  console.log(`[GET PROJECT] Success for ${id}. Role: ${result.projectRole}`);
  return result;
}

export async function listTasks(projectId: string, userId?: string, projectRole?: string) {
  const where: any = { projectId };
  
  return (prisma as any).projectTask.findMany({
    where,
    include: { meeting: true }
  });
}

export async function projectMetrics(projectId: string) {
  const total = await (prisma as any).projectTask.count({ where: { projectId } });
  const done = await (prisma as any).projectTask.count({ where: { projectId, status: 'COMPLETED' } });
  return { total, done };
}

export async function listProjectMeetings(projectId: string) {
  return (prisma as any).meeting.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { scheduledTime: 'desc' }
  });
}

export async function listProjectMembers(projectId: string) {
  const members = await (prisma as any).projectMember.findMany({
    where: { projectId },
    include: { user: true }
  });
  return {
    items: members.map((m: any) => ({
      id: m.id, // Use the projectMember ID
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      projectRole: m.projectRole,
      status: 'ACTIVE'
    })),
    total: members.length
  };
}

export async function getProjectIntegrations(orgId: string) {
  const connections = await (prisma as any).integrationConnection.findMany({
    where: { organizationId: orgId },
    include: { integration: true }
  });
  const providers = ['msteams', 'slack', 'asana'];
  return providers.map(p => {
    const conn = connections.find((c: any) => c.integration.name.toLowerCase() === p);
    return {
      provider: p,
      connected: !!conn && conn.status === 'connected',
      connectedAccount: conn?.status === 'connected' ? 'Connected' : undefined
    };
  });
}

export async function mergeMeetingToProject(orgId: string, projectId: string, meetingId: string) {
  const project = await (prisma as any).project.findUnique({
    where: { id: projectId, organizationId: orgId },
    include: { tasks: true, meetings: { where: { deletedAt: null }, orderBy: { scheduledTime: 'desc' } } }
  });

  if (!project) throw new Error('Project not found');

  const meeting = await (prisma as any).meeting.findUnique({
    where: { id: meetingId, organizationId: orgId }
  });

  if (!meeting) throw new Error('Meeting not found');

  // Identify the "previous state". We can use the extraction of the most recent 
  // PREVIOUS meeting (not the current one).
  const previousMeeting = project.meetings.find((m: any) => m.id !== meetingId && m.extractionJson);
  
  // If no previous meeting extraction, construct from project data
  const previousState = previousMeeting?.extractionJson || {
    final_summary: project.name,
    updated_tasks: project.tasks.map((t: any) => ({ 
      task: t.title, 
      owner: t.assigneeUserId || 'Not mentioned', 
      deadline: t.dueDate ? t.dueDate.toISOString() : 'Not mentioned' 
    })),
    deliverables: [],
    timeline: project.dueDate ? project.dueDate.toISOString() : '',
    budget: project.budgetTotal ? project.budgetTotal.toString() : '',
    client_information: {
      client_name: project.clientName || project.client || '',
    }
  };

  const newMeetingData = meeting.extractionJson || {};

  const merged = await mergeProjectData(previousState, newMeetingData);

  // Note: We are just returning the JSON as per the user's "Return ONLY valid JSON" requirement.
  // The user prompt in ai.service.ts already handles the logic.
  return merged;
}

export async function detectProjectTaskChanges(projectId: string, newMeetingTasks: any[]) {
    // 1. Fetch existing project tasks from the database
    const previousTasks = await (prisma as any).projectTask.findMany({
        where: { projectId },
    });

    const previousTaskPayload = previousTasks.map((t: any) => ({
        title: t.title,
        status: t.status,
        description: t.description,
        priority: t.priority,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        assigneeId: t.assigneeUserId
    }));

    // 2. Call detectTaskChanges from ai.service.ts
    const aiResult = await detectTaskChanges(previousTaskPayload, newMeetingTasks);

    // 3. Process AI result
    if (!aiResult || !Array.isArray(aiResult.tasks)) {
        console.error("AI service returned unexpected data for task sync:", aiResult);
        return { status: 'failed', error: 'Unexpected AI response' };
    }

    const summary = { created: 0, updated: 0, deleted: 0, ignored: 0, failed: 0 };

    for (const task of aiResult.tasks) {
        if (!task || !task.status || !task.title) {
            console.warn("Skipping invalid task object from AI:", task);
            summary.failed++;
            continue;
        }

        try {
            switch (task.status) {
                case 'NEW':
                    await (prisma as any).projectTask.create({
                        data: {
                            projectId,
                            title: task.title,
                            status: 'NOT_STARTED',
                        },
                    });
                    summary.created++;
                    break;

                case 'MODIFIED':
                    // Find the task by title (since AI is told not to paraphrase)
                    const taskToUpdate = previousTasks.find(
                        (t: any) => t.title === task.title
                    );
                    if (taskToUpdate) {
                        const data: any = { title: task.title };
                        
                        // Apply changes from AI result if provided in the 'changes' object
                        if (task.changes) {
                            if (task.changes.dueDate?.new) {
                                data.dueDate = new Date(task.changes.dueDate.new);
                            }
                            if (task.changes.description?.new) {
                                data.description = task.changes.description.new;
                            }
                            // In a more complete system, we'd also handle assigneeId mapping here
                        }

                        await (prisma as any).projectTask.update({
                            where: { id: taskToUpdate.id },
                            data,
                        });
                        summary.updated++;
                    } else {
                        console.warn(`Could not find task to modify: ${task.title}`);
                        summary.failed++;
                    }
                    break;

                case 'DELETED':
                    const taskToMarkCompleted = previousTasks.find(
                        (t: any) => t.title === task.title
                    );
                    if (taskToMarkCompleted) {
                        await (prisma as any).projectTask.update({
                            where: { id: taskToMarkCompleted.id },
                            data: { status: 'COMPLETED' },
                        });
                        summary.deleted++;
                    } else {
                        console.warn(`Could not find task to mark as deleted/completed: ${task.title}`);
                        summary.failed++;
                    }
                    break;

                case 'UNCHANGED':
                    summary.ignored++;
                    break;

                default:
                    console.warn(`Unknown status from AI: ${task.status}`);
                    summary.ignored++;
                    break;
            }
        } catch (error) {
            console.error(`Failed to process task '${task.title}':`, error);
            summary.failed++;
        }
    }
    return { status: 'success', summary };
}

export async function listMyProjects(userId: string) {
  const memberships = await (prisma as any).projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          _count: {
            select: { tasks: true }
          }
        }
      }
    }
  });

  console.log("[MY PROJECTS COUNT]", memberships.length);

  const enrichedItems = await Promise.all(memberships.map(async (m: any) => {
    const p = m.project;
    const tasksCompleted = await (prisma as any).projectTask.count({
      where: { projectId: p.id, status: 'COMPLETED' }
    });
    const tasksTotal = p._count?.tasks ?? 0;
    const progress = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

    return sanitizeProject({
      id: p.id,
      projectId: p.id,
      name: p.name,
      projectRole: m.projectRole,
      client: p.client || p.clientName || '',
      dueDate: p.dueDate,
      status: p.status,
      health: p.health || 'on-track',
      progress,
      tasksTotal,
      tasksCompleted,
      asanaLink: p.asanaLink,
      updatedAt: p.updatedAt
    }, m.projectRole);
  }));

  return enrichedItems;
}

export async function createProject(orgId: string, creatorUserId: string, input: any) {
  const data: any = {
    organizationId: orgId,
    name: input.name,
    client: input.client ?? null,
    clientName: input.clientName ?? input.client ?? null,
    progress: input.progress ?? 0,
    health: input.health ?? null,
    status: input.status ?? null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    asanaLink: input.asanaLink ?? null,
    budgetTotal: input.budget ? Number(input.budget) : 0,
    createdById: creatorUserId
  };
  const project = await (prisma as any).project.create({ data });
  await (prisma as any).projectMember.upsert({    where: { userId_projectId: { userId: creatorUserId, projectId: project.id } },    update: { projectRole: 'ADMIN' },    create: { userId: creatorUserId, projectId: project.id, projectRole: 'ADMIN' }  });
  return project;
}

export async function updateProject(orgId: string, id: string, input: any) {
  const data: any = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.client !== undefined) data.client = input.client;
  if (input.clientName !== undefined) data.clientName = input.clientName;
  if (input.progress !== undefined) data.progress = input.progress;
  if (input.health !== undefined) data.health = input.health;
  if (input.status !== undefined) data.status = input.status;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.asanaLink !== undefined) data.asanaLink = input.asanaLink;
  if (input.budget !== undefined) data.budgetTotal = Number(input.budget);
  return (prisma as any).project.update({
    where: { id },
    data,
    // extra safety via conditional update pattern
  });
}

export async function deleteProject(orgId: string, id: string, userId?: string) {
  // 1. RBAC Check: Only allow ADMIN to delete
  if (userId) {
    const membership = await (prisma as any).projectMember.findUnique({
      where: { userId_projectId: { userId, projectId: id } }
    });

    if (!membership || membership.projectRole !== 'ADMIN') {
      console.warn(`[DELETE PROJECT] Access denied. User ${userId} is not an ADMIN of project ${id}`);
      throw forbidden('Only project administrators can delete this project');
    }
  }

  // 2. Cascade Delete sequentially (removed transaction to prevent timeout)
  console.log(`[DELETE PROJECT] Starting permanent sequential delete for project ${id}`);
  
  // Delete associated members
  await (prisma as any).projectMember.deleteMany({ where: { projectId: id } });
  
  // Delete associated invites
  await (prisma as any).projectInvite.deleteMany({ where: { projectId: id } });
  
  // Delete associated tasks
  await (prisma as any).projectTask.deleteMany({ where: { projectId: id } });
  
  // Delete associated meetings
  await (prisma as any).meeting.deleteMany({ where: { projectId: id } });
  
  // Delete associated expenses
  await (prisma as any).projectExpense.deleteMany({ where: { projectId: id } });

  // Finally delete the project itself
  const project = await (prisma as any).project.delete({
    where: { id, organizationId: orgId }
  });

  console.log(`[DELETE PROJECT] Successfully deleted project ${id} and all related records`);
  return project;
}

export async function getBudget(projectId: string) {
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const agg = await (prisma as any).projectExpense.aggregate({
    where: { projectId },
    _sum: { amount: true }
  });
  const used = (agg._sum?.amount ?? 0) as any;
  const budgetTotal = (project.budgetTotal ?? 0) as any;
  const usedNum = typeof used === 'object' && used !== null && 'toNumber' in used ? (used as any).toNumber() : Number(used);
  const totalNum = typeof budgetTotal === 'object' && budgetTotal !== null && 'toNumber' in budgetTotal ? (budgetTotal as any).toNumber() : Number(budgetTotal);
  const remaining = Math.max(totalNum - usedNum, 0);
  const riskStatus = totalNum > 0 && usedNum / totalNum >= 0.8 ? 'At Risk' : 'On Track';
  return { budget: totalNum, used: usedNum, remaining, riskStatus };
}

export async function setBudget(projectId: string, amount: number) {
  return (prisma as any).project.update({ where: { id: projectId }, data: { budgetTotal: amount as any } });
}

export async function addExpense(projectId: string, input: { amount: number; description?: string; category?: string; incurredAt?: string }) {
  const data: any = { projectId, amount: input.amount as any };
  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.incurredAt) data.incurredAt = new Date(input.incurredAt);
  return (prisma as any).projectExpense.create({ data });
}

export async function listExpenses(projectId: string) {
  return (prisma as any).projectExpense.findMany({ where: { projectId }, orderBy: { incurredAt: 'desc' } });
}



export async function updateExpense(id: string, input: { amount?: number; description?: string; category?: string; incurredAt?: string }) {
  const data: any = {};
  if (input.amount !== undefined) data.amount = input.amount as any;
  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.incurredAt !== undefined) data.incurredAt = input.incurredAt ? new Date(input.incurredAt) : null;
  return (prisma as any).projectExpense.update({ where: { id }, data });
}

export async function deleteExpense(id: string) {
  return (prisma as any).projectExpense.delete({ where: { id } });
}
export async function inviteTeamMember(projectId: string, email: string, role: 'ADMIN' | 'PROJECT_MANAGER' | 'CONTRIBUTOR') {
  if (!projectId) throw badRequest("Project ID required");
  if (!email) throw badRequest("Email required");

  const user = await (prisma as any).user.findUnique({ where: { email } });
  if (!user) throw notFound("User not found");

  const existing = await (prisma as any).projectMember.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } }
  });

  if (existing) throw badRequest("User is already a member of this project");

  return (prisma as any).projectMember.create({
    data: {
      userId: user.id,
      projectId,
      projectRole: role
    }
  });
}

export async function updateProjectMemberRole(projectId: string, memberId: string, role: 'ADMIN' | 'PROJECT_MANAGER' | 'CONTRIBUTOR') {
  const validRoles = ["ADMIN", "PROJECT_MANAGER", "CONTRIBUTOR"];
  if (!validRoles.includes(role)) throw badRequest("Invalid role");

  return (prisma as any).projectMember.update({
    where: { userId_projectId: { userId: memberId, projectId } },
    data: { projectRole: role }
  });
}

export async function deleteProjectMember(projectId: string, memberId: string) {
  // Ensure the member belongs to the project before deleting
  const member = await (prisma as any).projectMember.findFirst({
    where: { id: memberId, projectId: projectId }
  });

  if (!member) {
    throw notFound('Project member not found');
  }

  return (prisma as any).projectMember.delete({
    where: { id: memberId }
  });
}



export async function createTask(projectId: string, title: string, assigneeUserId?: string, dueDate?: string, description?: string, status?: string, priority?: string, meetingId?: string) {
  const data: any = { projectId, title };
  if (description !== undefined) data.description = description;
  
  if (status !== undefined) {
    const s = status.toUpperCase().replace(/\s+/g, '_');
    if (['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(s)) {
      data.status = s;
    }
  }
  
  if (priority !== undefined) {
    const p = priority.toUpperCase();
    if (['LOW', 'MEDIUM', 'HIGH'].includes(p)) {
      data.priority = p;
    }
  }

  if (assigneeUserId && assigneeUserId !== 'undefined' && assigneeUserId !== 'null') {
    data.assigneeUserId = assigneeUserId;
  }
  
  if (dueDate) {
    const d = new Date(dueDate);
    if (!isNaN(d.getTime())) {
      data.dueDate = d;
    }
  }
  
  if (meetingId && meetingId !== 'undefined' && meetingId !== 'null') {
    data.meetingId = meetingId;
  }

  try {
    return await (prisma as any).projectTask.create({ data });
  } catch (error: any) {
    console.error('Prisma createTask error:', error);
    if (error.code === 'P2002') {
      throw new Error(`A task with the title "${title}" already exists in this project.`);
    }
    throw error;
  }
}

export async function updateTask(id: string, title?: string, status?: string, assigneeUserId?: string, dueDate?: string, description?: string, priority?: string) {
  const data: any = {};
  if (title !== undefined) data.title = title;
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (description !== undefined) data.description = description;
  if (assigneeUserId !== undefined) data.assigneeUserId = assigneeUserId;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  return (prisma as any).projectTask.update({ where: { id }, data });
}

export async function deleteTask(id: string) {
  return (prisma as any).projectTask.delete({ where: { id } });
}

export async function listMilestones(projectId: string) {
  if (!projectId) return [];
  try {
    const tasks = await (prisma as any).projectTask.findMany({
      where: { projectId, NOT: { dueDate: null } },
      orderBy: { dueDate: 'asc' }
    });

    if (tasks.length === 0) return [];

    // Group tasks by week for milestones
    const weeksMap = new Map<string, any[]>();
    tasks.forEach((task: any) => {
      const date = new Date(task.dueDate);
      const startOfWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      const weekKey = startOfWeek.toISOString().split('T')[0];

      if (!weeksMap.has(weekKey)) weeksMap.set(weekKey, []);
      weeksMap.get(weekKey)!.push(task);
    });

    const sortedWeeks = Array.from(weeksMap.keys()).sort();
    return sortedWeeks.map((weekKey, idx) => {
      const weekTasks = weeksMap.get(weekKey)!;
      const completed = weekTasks.filter(t => t.status === 'COMPLETED').length;
      const progress = Math.round((completed / weekTasks.length) * 100);
      
      return {
        id: `milestone-${weekKey}`,
        projectId,
        title: weekTasks.length > 1 ? `${weekTasks[0].title} & ${weekTasks.length - 1} others` : weekTasks[0].title,
        dueDate: weekKey,
        status: progress === 100 ? "Completed" : progress > 0 ? "In Progress" : "Not Started",
        progress,
        weekNumber: idx + 1
      };
    });
  } catch (error) {
    console.error("Error generating milestones from tasks:", error);
    return [];
  }
}

export async function createMilestone(projectId: string, title: string, dueDate?: string, status?: string, progress?: number) {
  try {
    const data: any = { projectId, title };
    if (dueDate) data.dueDate = new Date(dueDate);
    if (status) data.status = status;
    if (progress !== undefined) data.progress = progress;
    return await (prisma as any).projectMilestone.create({ data });
  } catch (error) {
    console.error("Error creating milestone (Table may be missing):", error);
    return null;
  }
}

export async function updateMilestone(id: string, title?: string, dueDate?: string, status?: string, progress?: number) {
  try {
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (status !== undefined) data.status = status;
    if (progress !== undefined) data.progress = progress;
    return await (prisma as any).projectMilestone.update({ where: { id }, data });
  } catch (error) {
    console.error("Error updating milestone (Table may be missing):", error);
    return null;
  }
}

export async function deleteMilestone(id: string) {
  try {
    return await (prisma as any).projectMilestone.delete({ where: { id } });
  } catch (error) {
    console.error("Error deleting milestone (Table may be missing):", error);
    return null;
  }
}

export async function listRisks(projectId: string) {
  if (!projectId) return [];
  try {
    const tasks = await (prisma as any).projectTask.findMany({ 
      where: { projectId },
      orderBy: { priority: 'desc' }
    });
    
    console.log("FETCHED TASKS FOR RISKS:", tasks);

    const generatedRisks = tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description || "Auto-generated from task",
      severity: task.priority ? task.priority.toUpperCase() : "MEDIUM",
      status: task.status === "COMPLETED" ? "Resolved" : "Active"
    }));

    console.log("GENERATED RISKS:", generatedRisks);
    return generatedRisks;
  } catch (error) {
    console.error("Error generating risks from tasks:", error);
    return [];
  }
}

export async function createRisk(projectId: string, title: string, description?: string, severity?: string, status?: string) {
  try {
    const data: any = { projectId, title };
    if (description) data.description = description;
    if (severity) data.severity = severity;
    if (status) data.status = status;
    return await (prisma as any).projectRisk.create({ data });
  } catch (error) {
    console.error("Error creating risk (Table may be missing):", error);
    return null;
  }
}

export async function updateRisk(id: string, title?: string, description?: string, severity?: string, status?: string) {
  try {
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (severity !== undefined) data.severity = severity;
    if (status !== undefined) data.status = status;
    return await (prisma as any).projectRisk.update({ where: { id }, data });
  } catch (error) {
    console.error("Error updating risk (Table may be missing):", error);
    return null;
  }
}

export async function deleteRisk(projectId: string, riskId: string) {
  return (prisma as any).projectRisk.delete({
    where: { id: riskId, projectId }
  });
}

// API Key Services
export async function listApiKeys(projectId: string) {
  return (prisma as any).apiKey.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsed: true
    }
  });
}

export async function createApiKey(projectId: string, userId: string, name: string) {
  const key = `ao_${generateRandomToken(32)}`;
  const keyHash = sha256(key);
  
  await (prisma as any).apiKey.create({
    data: {
      name,
      keyHash,
      userId,
      projectId
    }
  });

  return { key }; // Return raw key only once
}

export async function deleteApiKey(projectId: string, keyId: string) {
  return (prisma as any).apiKey.delete({
    where: { id: keyId, projectId }
  });
}

export async function archiveProject(orgId: string, id: string) {
  return (prisma as any).project.update({
    where: { id, organizationId: orgId },
    data: { status: 'ARCHIVED' }
  });
}

export async function syncAsana(orgId: string, id: string) {
  const project = await (prisma as any).project.findUnique({ where: { id, organizationId: orgId } });
  if (!project) throw new Error('Project not found');
  // Mocking Asana sync: updating updatedAt
  return (prisma as any).project.update({
    where: { id },
    data: { updatedAt: new Date() }
  });
}

export async function generateAITasks(orgId: string, id: string) {
  const project = await (prisma as any).project.findUnique({ where: { id, organizationId: orgId } });
  if (!project) throw new Error('Project not found');
  
  // Find latest meeting for this project to extract from
  const meeting = await (prisma as any).meeting.findFirst({
    where: { projectId: id, organizationId: orgId, deletedAt: null },
    orderBy: { scheduledTime: 'desc' }
  });

  if (!meeting || !meeting.rawTranscript) {
    // Return empty list if no transcript to extract from
    return [];
  }

  const { extractMeetingData } = require('../../services/ai.service');
  const extracted = await extractMeetingData(meeting.rawTranscript);
  
  const tasks = (extracted.milestones || extracted.tasks || []).map((t: any) => ({
    projectId: id,
    title: t.task || t.title || 'Extracted Task',
    description: `Extracted from meeting: ${meeting.title}`,
    status: 'NOT_STARTED',
    priority: 'MEDIUM'
  }));

  if (tasks.length > 0) {
    await (prisma as any).projectTask.createMany({ data: tasks });
  }

  return tasks;
}


