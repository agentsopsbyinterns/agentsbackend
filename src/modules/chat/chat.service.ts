import { prisma } from '../../prisma/client.js';
import OpenAI from "openai";
import { env } from "../../config/env.js";
import { badRequest, notFound, forbidden } from '../../common/errors/api-error.js';
import { buildAIContext, buildSystemPrompt } from '../../services/ai.service.js';
import { emitToProject, emitToUser } from '../../common/utils/socket.js';

export async function createConversation(orgId: string, userId: string, type: string = 'AI', projectId?: string) {
  return (prisma as any).conversation.create({
    data: { 
      organizationId: orgId, 
      createdById: userId, 
      type: type as any,
      projectId,
      participants: {
        connect: { id: userId }
      }
    }
  });
}

export async function getOrCreateDirectConversation(orgId: string, userId: string, targetUserId: string) {
  try {
    console.log(`[ChatService] getOrCreateDirectConversation between ${userId} and ${targetUserId}`);
    
    // Check if a DIRECT conversation already exists between these two users
    // We use a safe query that handles missing 'type' or 'participants' gracefully if needed
    const conversationModel = (prisma as any).conversation;
    if (!conversationModel) throw new Error("Conversation model not found");

    const existing = await conversationModel.findFirst({
      where: {
        type: 'DIRECT',
        organizationId: orgId,
        AND: [
          { participants: { some: { id: userId } } },
          { participants: { some: { id: targetUserId } } }
        ]
      },
      include: {
        participants: { select: { id: true, name: true, avatarUrl: true } }
      }
    });

    if (existing) {
      console.log(`[ChatService] Found existing direct conversation: ${existing.id}`);
      return existing;
    }

    console.log(`[ChatService] Creating new direct conversation`);
    // Create new DIRECT conversation
    return await conversationModel.create({
      data: {
        organizationId: orgId,
        createdById: userId,
        type: 'DIRECT',
        participants: {
          connect: [{ id: userId }, { id: targetUserId }]
        }
      },
      include: {
        participants: { select: { id: true, name: true, avatarUrl: true } }
      }
    });
  } catch (err) {
    console.error("[ChatService] Error in getOrCreateDirectConversation:", err);
    throw err; // Re-throw to be handled by controller
  }
}

export async function listConversations(userId: string, orgId: string) {
  try {
    const conversationModel = (prisma as any).conversation;
    if (!conversationModel) return [];

    return await conversationModel.findMany({
      where: { organizationId: orgId, createdById: userId },
      orderBy: { createdAt: 'desc' }
    });
  } catch (err) {
    console.error("[ChatService] Error in listConversations:", err);
    return [];
  }
}

export async function listMessages(conversationId: string) {
  return (prisma as any).message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } }
  });
}

export async function createMessage(conversationId: string, userId: string | null, role: string, content: string) {
  return (prisma as any).message.create({ 
    data: { conversationId, userId, role, content },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } }
  });
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
  const lastMessage = messages?.length > 0 ? messages[messages.length - 1]?.content.toLowerCase() : "";
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
    systemPrompt += `\n\nNote: The user is asking about the project: "${mentionedProjects[0]?.name}".`;
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

export async function listTeamChatMessages(projectId: string, userId: string) {
  const member = await (prisma as any).projectMember.findFirst({
    where: { projectId, userId }
  });
  if (!member) throw forbidden('You are not a member of this project');

  const messages = await (prisma as any).teamChatMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } }
  });

  // Standardize team messages to match frontend expectations
  return messages
    .filter((msg: any) => {
      const deletedBy = Array.isArray(msg.deletedBy) ? msg.deletedBy : [];
      return !deletedBy.includes(userId);
    })
    .map((msg: any) => {
      if (msg.isDeleted) {
        return {
          id: msg.id,
          senderId: msg.senderId,
          content: "This message was deleted",
          createdAt: msg.createdAt,
          sender: msg.sender || { id: msg.senderId, name: "Unknown" },
          isDeleted: true,
          attachments: []
        };
      }
      return {
        id: msg.id,
        senderId: msg.senderId,
        content: msg.content,
        createdAt: msg.createdAt,
        sender: msg.sender || { id: msg.senderId, name: "Unknown" },
        isEdited: msg.isEdited,
        attachments: msg.attachments || []
      };
    });
}

export async function createTeamChatMessage(projectId: string, userId: string, content: string, attachments?: any[]) {
  const member = await (prisma as any).projectMember.findFirst({
    where: { projectId, userId }
  });
  if (!member) throw forbidden('You are not a member of this project');

  const msg = await (prisma as any).teamChatMessage.create({
    data: { 
      projectId, 
      senderId: userId, 
      content, 
      deletedBy: [],
      attachments: attachments || []
    },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } }
  });

  return {
    id: msg.id,
    projectId: msg.projectId,
    senderId: msg.senderId,
    content: msg.content,
    createdAt: msg.createdAt,
    sender: msg.sender || { id: msg.senderId, name: "Unknown" },
    attachments: msg.attachments || []
  };
}

export async function updateTeamChatMessage(messageId: string, userId: string, content: string) {
  const msg = await (prisma as any).teamChatMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw notFound('Message not found');
  if (msg.senderId !== userId) throw forbidden('Only the sender can edit this message');
  if (msg.isDeleted) throw badRequest('Cannot edit a deleted message');

  const updated = await (prisma as any).teamChatMessage.update({
    where: { id: messageId },
    data: { content, isEdited: true },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } }
  });

  return {
    id: updated.id,
    projectId: updated.projectId,
    senderId: updated.senderId,
    content: updated.content,
    createdAt: updated.createdAt,
    sender: updated.sender || { id: updated.senderId, name: "Unknown" },
    isEdited: true,
    attachments: updated.attachments || []
  };
}

export async function softDeleteTeamChatMessage(messageId: string, userId: string) {
  const msg = await (prisma as any).teamChatMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw notFound('Message not found');

  // Check if user is part of the project
  const member = await (prisma as any).projectMember.findFirst({
    where: { projectId: msg.projectId, userId }
  });
  if (!member) throw forbidden('You are not a member of this project');

  const currentDeletedBy = Array.isArray(msg.deletedBy) ? msg.deletedBy : [];
  if (!currentDeletedBy.includes(userId)) {
    currentDeletedBy.push(userId);
  }

  return (prisma as any).teamChatMessage.update({
    where: { id: messageId },
    data: { deletedBy: currentDeletedBy }
  });
}

export async function globalDeleteTeamChatMessage(messageId: string, userId: string) {
  const msg = await (prisma as any).teamChatMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw notFound('Message not found');

  // 🔥 IMPORTANT: Authorization check
  if (msg.senderId !== userId) {
    throw forbidden('You can only delete your own message');
  }

  return (prisma as any).teamChatMessage.update({
    where: { id: messageId },
    data: { 
      isDeleted: true,
      deletedAt: new Date(),
      globalDeletedBy: userId
    }
  });
}

// --- Direct Messaging Services ---

export async function listDirectMessages(userId: string, targetUserId: string) {
  const messages = await (prisma as any).directMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: targetUserId },
        { senderId: targetUserId, receiverId: userId }
      ]
    },
    orderBy: { createdAt: 'asc' },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } }
    }
  });

  // Standardize direct messages to match team chat message format for frontend
  return messages.map((msg: any) => ({
    id: msg.id,
    senderId: msg.senderId,
    content: msg.content,
    createdAt: msg.createdAt,
    sender: msg.sender || { id: msg.senderId, name: "Unknown" },
    attachments: msg.attachments || []
  }));
}

export async function sendDirectMessage(senderId: string, receiverId: string, content: string, attachments?: any[]) {
  const msg = await (prisma as any).directMessage.create({
    data: {
      senderId,
      receiverId,
      content,
      attachments: attachments || []
    },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } }
    }
  });

  return {
    id: msg.id,
    senderId: msg.senderId,
    content: msg.content,
    createdAt: msg.createdAt,
    sender: msg.sender || { id: msg.senderId, name: "Unknown" },
    attachments: msg.attachments || []
  };
}

// --- Read Receipt & Unread Tracking ---

export async function markChatAsRead(userId: string, projectId?: string, targetUserId?: string) {
  try {
    const receiptModel = (prisma as any).chatReadReceipt;
    if (!receiptModel) {
      console.warn("[ChatService] chatReadReceipt model not found in Prisma client");
      return null;
    }

    if (projectId) {
      console.log(`[ChatService] Marking project ${projectId} as read for user ${userId}`);
      return await receiptModel.upsert({
        where: { userId_projectId: { userId, projectId } },
        update: { lastReadAt: new Date() },
        create: { userId, projectId, lastReadAt: new Date() }
      });
    } else if (targetUserId) {
      console.log(`[ChatService] Marking direct chat with user ${targetUserId} as read for user ${userId}`);
      return await receiptModel.upsert({
        where: { userId_targetUserId: { userId, targetUserId } },
        update: { lastReadAt: new Date() },
        create: { userId, targetUserId, lastReadAt: new Date() }
      });
    }
  } catch (err) {
    console.error("[ChatService] Error in markChatAsRead:", err);
    return null;
  }
}

export async function getConversationsWithUnread(userId: string) {
  try {
    console.log(`[ChatService] START getConversationsWithUnread for userId: ${userId}`);

    // 1. Get user info to get organizationId
    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { organizationId: true }
    });

    if (!user) {
      console.warn(`[ChatService] User with id ${userId} not found in database`);
      return []; 
    }

    const organizationId = user.organizationId;
    console.log(`[ChatService] User found. organizationId: ${organizationId}`);

    // 2. Get all projects for user
    const memberships = await (prisma as any).projectMember.findMany({
      where: { userId },
      include: { project: true }
    });
    console.log(`[ChatService] Found ${memberships?.length || 0} memberships`);

    // 3. Get all users for direct chats in the same organization
    const users = await (prisma as any).user.findMany({
      where: { 
        id: { not: userId }, 
        organizationId: organizationId 
      },
      select: { id: true, name: true, avatarUrl: true, email: true }
    });
    console.log(`[ChatService] Found ${users?.length || 0} potential DM users`);

    // 4. Get read receipts
    const readReceipts = await (prisma as any).chatReadReceipt.findMany({
      where: { userId }
    });
    console.log(`[ChatService] Found ${readReceipts?.length || 0} read receipts`);

    // 5. Calculate unread for projects
    const projectsWithUnread = await Promise.all((memberships || []).map(async (m: any, index: number) => {
      try {
        if (!m.project) {
          console.warn(`[ChatService] Membership at index ${index} has null project. projectId: ${m.projectId}`);
        }

        const lastRead = readReceipts.find((r: any) => r.projectId === m.projectId)?.lastReadAt || new Date(0);
        
        const unreadCount = await (prisma as any).teamChatMessage.count({
          where: {
            projectId: m.projectId,
            createdAt: { gt: lastRead },
            senderId: { not: userId },
            isDeleted: false
          }
        });

        const lastMsg = await (prisma as any).teamChatMessage.findFirst({
          where: { projectId: m.projectId, isDeleted: false },
          orderBy: { createdAt: 'desc' },
          select: { content: true, createdAt: true }
        });

        return {
          id: m.projectId,
          name: m.project?.name || "Unknown Project",
          type: 'project',
          unreadCount,
          lastMessage: lastMsg?.content || "No messages yet",
          lastMessageAt: lastMsg?.createdAt || m.project?.createdAt || new Date(0)
        };
      } catch (err) {
        console.error(`[ChatService] Error mapping project membership ${m.projectId}:`, err);
        return null;
      }
    }));

    // 6. Calculate unread for users
    const usersWithUnread = await Promise.all((users || []).map(async (u: any) => {
      try {
        const lastRead = readReceipts.find((r: any) => r.targetUserId === u.id)?.lastReadAt || new Date(0);
        
        // 1. Get direct conversation with this user
        const conv = await (prisma as any).conversation.findFirst({
          where: {
            type: 'DIRECT',
            organizationId: organizationId,
            AND: [
              { participants: { some: { id: userId } } },
              { participants: { some: { id: u.id } } }
            ]
          },
          select: { id: true }
        });

        let unreadCount = 0;
        let lastMsg = null;

        if (conv) {
          // 2. Fetch unread count from Message table
          unreadCount = await (prisma as any).message.count({
            where: {
              conversationId: conv.id,
              userId: { not: userId }, // Messages sent by others
              createdAt: { gt: lastRead }
            }
          });

          // 3. Fetch last message from Message table
          lastMsg = await (prisma as any).message.findFirst({
            where: { conversationId: conv.id },
            orderBy: { createdAt: 'desc' },
            select: { content: true, createdAt: true }
          });
        }

        return {
          id: u.id,
          userId: u.id,
          participantId: u.id,
          name: u.name || u.email || "Unknown User",
          avatarUrl: u.avatarUrl,
          type: 'user',
          unreadCount,
          conversationId: conv?.id || null,
          lastMessage: lastMsg ? lastMsg.content : "",
          lastMessageAt: lastMsg ? lastMsg.createdAt : null
        };
      } catch (err) {
        console.error(`[ChatService] Error mapping DM user ${u.id}:`, err);
        return null;
      }
    }));

    // 7. Filter nulls, combine and sort
    const allConversations = [
      ...projectsWithUnread.filter(Boolean), 
      ...usersWithUnread.filter(Boolean)
    ];

    console.log(`[ChatService] Successfully processed ${allConversations.length} total conversations`);

    return allConversations.sort((a: any, b: any) => {
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return timeB - timeA;
    });

  } catch (globalErr) {
    console.error(`[ChatService] CRITICAL ERROR in getConversationsWithUnread for user ${userId}:`, globalErr);
    return []; // Return empty array to prevent 500 error
  }
}
