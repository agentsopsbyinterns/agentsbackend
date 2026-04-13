
import { prisma } from '../../prisma/client.js';
import { ProjectRole, InviteStatus } from '@prisma/client';
import { sendMail } from '../../common/utils/mailer.js';
import { env } from '../../config/env.js';
import { generateRandomToken, sha256 } from '../../common/utils/tokens.js';
import { mapLegacyRole, PROJECT_ROLES } from '../../common/utils/roles.js';

// Get all members for a specific project
export async function getProjectMembers(projectId: string) {
  try {
    const [members, invites] = await Promise.all([
      (prisma as any).projectMember.findMany({
        where: { projectId: projectId },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
      (prisma as any).projectInvite.findMany({
        where: { 
          projectId: projectId,
          status: InviteStatus.PENDING,
          expiresAt: { gt: new Date() }
        }
      })
    ]);

    // Format active members
    const formattedMembers = members.map((m: any) => ({
      id: m.id,
      userId: m.userId,
      name: m.user?.name || m.user?.email.split('@')[0],
      email: m.user?.email,
      role: mapLegacyRole(m.projectRole),
      projectRole: mapLegacyRole(m.projectRole),
      status: 'active',
      avatarUrl: m.user?.avatarUrl
    }));

    // Format pending invites
    const formattedInvites = invites.map((i: any) => ({
      id: i.id,
      userId: null,
      name: i.email.split('@')[0],
      email: i.email,
      role: mapLegacyRole(i.projectRole),
      projectRole: mapLegacyRole(i.projectRole),
      status: 'invited',
      avatarUrl: null
    }));

    const combined = [...formattedMembers, ...formattedInvites];
    
    console.log(`[getProjectMembers] Found ${members.length} members and ${invites.length} invites for project ${projectId}`);
    return { items: combined, total: combined.length };
  } catch (error: any) {
    console.error('Error in getProjectMembers findMany:', error);
    throw error;
  }
}

// Invite a new member to a project
export async function inviteMember(projectId: string, orgId: string, email: string, role: string) {
  console.log('inviteMember called with:', { projectId, orgId, email, role });
  
  // 1. Check if user is already a member
  const user = await (prisma as any).user.findUnique({ where: { email } });
  if (user) {
    const existing = await (prisma as any).projectMember.findFirst({
      where: {
        userId: user.id,
        projectId: projectId,
      },
    });

    if (existing) {
      throw new Error('Email already exists in this project');
    }
  }

  const prismaRole = mapLegacyRole(role);
  
  // 2. Create or Update ProjectInvite record ONLY (Status: PENDING)
  const token = generateRandomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  try {
    // 2. Check for existing invite to update it, avoiding "null in unique" issues with upsert
    let invite = await (prisma as any).projectInvite.findFirst({
      where: { 
        organizationId: orgId, 
        projectId, 
        email 
      }
    });

    if (invite) {
      await (prisma as any).projectInvite.update({
        where: { id: invite.id },
        data: {
          projectRole: prismaRole,
          tokenHash,
          expiresAt,
          status: InviteStatus.PENDING
        }
      });
    } else {
      await (prisma as any).projectInvite.create({
        data: {
          organizationId: orgId,
          projectId,
          email,
          projectRole: prismaRole,
          tokenHash,
          expiresAt,
          status: InviteStatus.PENDING
        }
      });
    }

    // 3. Fetch project name for email
    const project = await (prisma as any).project.findUnique({
      where: { id: projectId },
      select: { name: true }
    });

    // 4. Send invitation email - MUST NOT FAIL SILENTLY
    const inviteLink = `${env.APP_URL}/accept-invite?token=${token}&projectId=${projectId}`;
    const projectName = project?.name || "a project";

    await sendMail({
      to: email,
      subject: "AgentOps Project Invitation",
      html: `
      <div style="font-family:Arial,Helvetica,sans-serif;background:#f9fafb;padding:30px">
        <div style="max-width:500px;margin:auto;background:white;padding:30px;border-radius:10px;border:1px solid #eee">
          <h2 style="margin-top:0;color:#111">AgentOps</h2>
          <p style="font-size:16px;color:#333">
            You have been invited to join the project <strong>${projectName}</strong>.
          </p>
          <div style="margin:25px 0;text-align:center">
            <a href="${inviteLink}" style="background:#6366f1;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">Accept Invitation</a>
          </div>
          <p style="font-size:12px;color:#888">If the button doesn't work copy this link:</p>
          <p style="font-size:12px;color:#6366f1">${inviteLink}</p>
        </div>
      </div>
      `
    });

    return { message: 'Invitation sent successfully', email, projectRole: prismaRole };
  } catch (error: any) {
    console.error('Error in inviteMember:', error);
    throw new Error(`Failed to invite member: ${error.message}`);
  }
}

// Remove a member from a project
export async function removeMember(projectId: string, memberId: string) {
  // Try finding in ProjectMember first
  const member = await (prisma as any).projectMember.findUnique({
    where: { id: memberId },
  });
  
  if (member) {
    if (member.projectId !== projectId) {
      throw new Error('Project member not found in this project.');
    }
    return (prisma as any).projectMember.delete({ where: { id: memberId } });
  }

  // If not found, try finding in ProjectInvite
  const invite = await (prisma as any).projectInvite.findUnique({
    where: { id: memberId },
  });

  if (invite) {
    if (invite.projectId !== projectId) {
      throw new Error('Project invitation not found in this project.');
    }
    return (prisma as any).projectInvite.delete({ where: { id: memberId } });
  }

  throw new Error('Project member or invitation not found.');
}

// Update a member's role
export async function updateMemberRole(projectId: string, memberId: string, role: string) {
  const prismaRole = mapLegacyRole(role);

  // Try updating ProjectMember first
  const member = await (prisma as any).projectMember.findUnique({
    where: { id: memberId },
  });

  if (member) {
    if (member.projectId !== projectId) {
      throw new Error('Project member not found in this project.');
    }
    return (prisma as any).projectMember.update({
      where: { id: memberId },
      data: { projectRole: prismaRole },
    });
  }

  // If not found, try updating ProjectInvite
  const invite = await (prisma as any).projectInvite.findUnique({
    where: { id: memberId },
  });

  if (invite) {
    if (invite.projectId !== projectId) {
      throw new Error('Project invitation not found in this project.');
    }
    return (prisma as any).projectInvite.update({
      where: { id: memberId },
      data: { projectRole: prismaRole },
    });
  }

  throw new Error('Project member or invitation not found.');
}

// Accept a project invitation
export async function acceptProjectInvite(token: string, userId?: string) {
  if (!token) throw new Error('Token is required');
  
  const tokenHash = sha256(token);
  console.log(`[acceptProjectInvite] Looking up tokenHash: ${tokenHash} for token: ${token}`);

  const invite = await (prisma as any).projectInvite.findUnique({
    where: { tokenHash },
    include: { project: true }
  });

  if (!invite) {
    console.error(`[acceptProjectInvite] No invite found for tokenHash: ${tokenHash}`);
    throw new Error('Invite invalid or expired (token not found)');
  }

  if (invite.status === InviteStatus.ACCEPTED) {
    throw new Error('Invitation has already been accepted');
  }

  if (invite.expiresAt < new Date()) {
    throw new Error('Invitation link has expired');
  }

  // Check if it's an organization-level invite (no projectId)
  if (!invite.projectId) {
    // Logic for organization-level invite
    if (userId) {
      const loggedInUser = await (prisma as any).user.findUnique({ where: { id: userId } });
      if (!loggedInUser) throw new Error('User not found');
      
      if (loggedInUser.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new Error(`This invitation was sent to ${invite.email}, but you are logged in as ${loggedInUser.email}.`);
      }

      await (prisma as any).$transaction([
        (prisma as any).user.update({
          where: { id: userId },
          data: { organizationId: invite.organizationId }
        }),
        (prisma as any).projectInvite.update({
          where: { id: invite.id },
          data: { status: InviteStatus.ACCEPTED }
        })
      ]);
      return { success: true, organizationId: invite.organizationId };
    }

    return { 
      success: true, 
      organizationId: invite.organizationId, 
      userExists: true, // Organization invites are usually for existing users or handled via signup
      email: invite.email 
    };
  }

  const project = invite.project;
  if (!project) throw new Error('Project not found');

  // Check if user exists by invite email
  const existingUserByEmail = await (prisma as any).user.findUnique({ where: { email: invite.email } });

  // If userId is provided, it means the user is logged in and accepting
  if (userId) {
    const loggedInUser = await (prisma as any).user.findUnique({ where: { id: userId } });
    if (!loggedInUser) throw new Error('User not found');

    if (loggedInUser.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new Error(`This invitation was sent to ${invite.email}, but you are logged in as ${loggedInUser.email}. Please log in with the correct account.`);
    }

    console.log("[ACCEPT INVITE] user:", userId, "project:", invite.projectId);
    
    const projectRole = mapLegacyRole(invite.projectRole);

    // Transaction to ensure atomic update
    await (prisma as any).$transaction([
      // 1. Create ProjectMember
      (prisma as any).projectMember.upsert({
        where: { userId_projectId: { userId, projectId: invite.projectId } },
        update: { projectRole },
        create: {
          userId,
          projectId: invite.projectId,
          projectRole,
          joinedAt: new Date()
        }
      }),
      // 2. Update user's organizationId to match the project's organization
      (prisma as any).user.update({
        where: { id: userId },
        data: { organizationId: invite.organizationId }
      }),
      // 3. Mark project invite as accepted
      (prisma as any).projectInvite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED }
      })
    ]);

    console.log(`[INVITE ACCEPTANCE SUCCESS] User: ${userId}, Project: ${invite.projectId}, Role: ${projectRole}`);

    return { success: true, projectId: invite.projectId };
  }

  // If userId is NOT provided, we are just verifying the invite (GET request)
  return { 
    success: true, 
    projectId: invite.projectId, 
    userExists: !!existingUserByEmail, 
    email: invite.email,
    projectRole: mapLegacyRole(invite.projectRole),
    organizationId: project.organizationId
  };
}

