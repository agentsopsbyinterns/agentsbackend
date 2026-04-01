import { prisma } from '../../prisma/client.js';
import OpenAI from "openai";
import { env } from "../../config/env.js";
import { badRequest, notFound, forbidden } from '../../common/errors/api-error.js';
import { buildAIContext, buildSystemPrompt } from '../../services/ai.service.js';

export async function createConversation(orgId: string, userId: string) {
  return (prisma as any).conversation.create({
    data: { organizationId: orgId, createdById: userId }
  });
}

export async function listConversations(userId: string, orgId: string) {
  return (prisma as any).conversation.findMany({
    where: { organizationId: orgId, createdById: userId },
    orderBy: { createdAt: 'desc' }
  });
}

export async function listMessages(conversationId: string) {
  return (prisma as any).message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' }
  });
}

export async function createMessage(conversationId: string, userId: string | null, role: string, content: string) {
  return (prisma as any).message.create({ data: { conversationId, userId, role, content } });
}

export async function askAI(conversationId: string, orgId: string, userId: string, onChunk: (chunk: string) => void, projectId?: string) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("AI Assistant is not configured. Please add OPENAI_API_KEY to your environment.");
  }

  const messages = await listMessages(conversationId);
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  
  let systemPrompt = "";
  let context = "";

  // 1. Fetch ALL projects user belongs to (from /my-projects logic)
  const memberships = await (prisma as any).projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          _count: { select: { tasks: true } }
        }
      }
    }
  });

  const allProjects = await Promise.all(memberships.map(async (m: any) => {
    const p = m.project;
    const tasksCompleted = await (prisma as any).projectTask.count({
      where: { projectId: p.id, status: 'COMPLETED' }
    });
    const tasksTotal = p._count?.tasks ?? 0;
    const progress = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
    
    return {
      ...p,
      projectRole: m.projectRole,
      progress,
      tasksTotal,
      tasksCompleted
    };
  }));

  // Determine user's primary role for the current context
  let primaryRole = 'CONTRIBUTOR';
  if (projectId) {
    const currentMember = memberships.find((m: any) => m.projectId === projectId);
    primaryRole = currentMember?.projectRole || 'CONTRIBUTOR';
  } else if (allProjects.length > 0) {
    // If no active project, use the most permissive role from their projects
    const roles = allProjects.map(p => p.projectRole);
    if (roles.includes('ADMIN')) primaryRole = 'ADMIN';
    else if (roles.includes('PROJECT_MANAGER')) primaryRole = 'PROJECT_MANAGER';
  }

  // 2. Fetch recent tasks and meetings across all projects
  const projectIds = allProjects.map(p => p.id);
  const [tasks, meetings] = await Promise.all([
    (prisma as any).projectTask.findMany({
      where: { projectId: { in: projectIds } },
      take: 20,
      orderBy: { dueDate: 'asc' },
      include: { project: { select: { name: true } } }
    }),
    (prisma as any).meeting.findMany({
      where: { projectId: { in: projectIds }, deletedAt: null },
      take: 10,
      orderBy: { scheduledTime: 'desc' },
      include: { project: { select: { name: true } } }
    })
  ]);

  // 3. Guard for budget questions if user is a restricted role
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase();
  const isRestrictedRole = primaryRole === 'CONTRIBUTOR' || primaryRole === 'PROJECT_MANAGER' || primaryRole === 'PM';
  
  if (isRestrictedRole && lastMessage && (lastMessage.includes('budget') || lastMessage.includes('cost') || lastMessage.includes('expense') || lastMessage.includes('money') || lastMessage.includes('price'))) {
    const accessDenied = "I'm sorry, but you do not have permission to access budget or financial information for your projects.";
    onChunk(accessDenied);
    await createMessage(conversationId, null, 'assistant', accessDenied);
    return;
  }

  // 4. Smart Project Context Handling
  const projectNames = allProjects.map(p => p.name.toLowerCase());
  const mentionedProjects = allProjects.filter(p => lastMessage.includes(p.name.toLowerCase()));

  let projectsForContext = allProjects;

  if (mentionedProjects.length === 1) {
    // If one project is clearly mentioned, focus on it
    projectsForContext = mentionedProjects;
    systemPrompt += `\n\nNote: The user is asking about the project: "${mentionedProjects[0].name}".`;
  } else if (allProjects.length > 1 && mentionedProjects.length === 0 && !projectId) {
    // If multiple projects exist but none are mentioned, ask for clarification
    const projectList = allProjects.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const clarification = `I can help with that. You are a member of ${allProjects.length} projects:\n${projectList}\n\nWhich project would you like to discuss?`;
    onChunk(clarification);
    await createMessage(conversationId, null, 'assistant', clarification);
    return;
  }

  // 5. Build Context and System Prompt
  context = buildAIContext({ projects: projectsForContext, meetings, tasks }, primaryRole);
  systemPrompt = `${buildSystemPrompt(primaryRole)}\n\nProject Context:\n${context}`;

  if (projectId) {
    const activeProject = allProjects.find(p => p.id === projectId);
    if (activeProject) {
      systemPrompt += `\n\nNote: The user is currently viewing the project: "${activeProject.name}".`;
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m: any) => ({ 
          role: (m.role === 'assistant' || m.role === 'user' || m.role === 'system') ? m.role : 'user', 
          content: m.content 
        }))
      ],
      stream: true,
    });

    let fullContent = "";
    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullContent += content;
        onChunk(content);
      }
    }

    await createMessage(conversationId, null, 'assistant', fullContent);

    // Also save to the new Chat model as per user instructions for persistence and isolation
    try {
      await (prisma as any).chat.create({
        data: {
          userId,
          message: lastMessage || "",
          response: fullContent
        }
      });
    } catch (err) {
      console.error("Failed to save to Chat model:", err);
    }
  } catch (err: any) {
    console.error("OpenAI Error:", err);
    throw new Error(`AI Request failed: ${err.message || "Unknown error"}`);
  }
}

export async function deleteConversation(userId: string, conversationId: string) {
  return (prisma as any).conversation.deleteMany({
    where: {
      id: conversationId,
      createdById: userId
    }
  });
}

export async function clearAllConversations(userId: string) {
  return (prisma as any).conversation.deleteMany({
    where: {
      createdById: userId
    }
  });
}
