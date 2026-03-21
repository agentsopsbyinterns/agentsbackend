
import { prisma } from '../../prisma/client';
import { ProjectRole } from '@prisma/client';
import { sendMail } from '../../common/utils/mailer';
import { env } from '../../config/env';
import { generateRandomToken, sha256 } from '../../common/utils/tokens';
import { mapLegacyRole, PROJECT_ROLES } from '../../common/utils/roles';

// Helper to find an existing user by email, or create a new one if they don't exist in the org
async function findOrCreateUserByEmail(email: string, orgId: string) {
  if (!email) throw new Error('Email is required');
  if (!orgId) throw new Error('Organization ID is required');
  
  try {
    let user = await (prisma as any).user.findUnique({ where: { email } });
    if (!user) {
      // Check if this is the first user in the organization
      const orgUsersCount = await (prisma as any).user.count({
        where: { organizationId: orgId }
      });

      // If user doesn't exist at all, create them and associate with the org
      user = await (prisma as any).user.create({
        data: {
          email,
          name: email.split('@')[0], // Default name from email prefix
          organizationId: orgId,
          passwordHash: 'INVITED_USER', // Added passwordHash for invited users
          globalRole: orgUsersCount === 0 ? 'ADMIN' : 'TEAM_MEMBER',
        },
      });
    } else if (!user.organizationId || user.organizationId !== orgId) {
      // If user exists but is not part of the correct org, update them
      user = await (prisma as any).user.update({
        where: { id: user.id },
        data: { organizationId: orgId },
      });
    }
    return user;
  } catch (error: any) {
    console.error('Error in findOrCreateUserByEmail:', error);
    throw new Error(`User lookup/creation failed: ${error.message}`);
  }
}

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
          status: "PENDING",
          expiresAt: { gt: new Date() }
        }
      })
    ]);

    // Map existing member emails to avoid duplicates
    const memberEmails = new Set(members.map((m: any) => m.user?.email.toLowerCase()).filter(Boolean));
    
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

    // Format pending invites only if the user is NOT already a member
    const formattedInvites = invites
      .filter((i: any) => !memberEmails.has(i.email.toLowerCase()))
      .map((i: any) => ({
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
  
  // Fetch project name for the email
  const project = await (prisma as any).project.findUnique({
    where: { id: projectId },
    select: { name: true }
  });

  const user = await findOrCreateUserByEmail(email, orgId);
  console.log('findOrCreateUserByEmail result:', user);
  
  try {
    const existing = await (prisma as any).projectMember.findFirst({
      where: {
        userId: user.id,
        projectId: projectId,
      },
    });

    if (existing) {
      console.log('User already in project');
      return { message: 'User already in project' };
    }

    const prismaRole = mapLegacyRole(role);
    console.log('prismaRole to use:', prismaRole);

    // Requirement 1: Create ProjectMember immediately
    const projectMember = await (prisma as any).projectMember.upsert({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: projectId
        }
      },
      update: {
        projectRole: prismaRole
      },
      create: {
        userId: user.id,
        projectId: projectId,
        projectRole: prismaRole,
        joinedAt: new Date()
      }
    });

    console.log(`[PROJECT MEMBER CREATED] User: ${user.id}, Project: ${projectId}, Role: ${prismaRole}`);

    // Requirement 10: Log invite creation
    console.log(`[INVITE CREATION] Project: ${projectId}, Email: ${email}, Role: ${prismaRole}`);

    // Create a ProjectInvite record with a token
    const token = generateRandomToken(32);
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

    await (prisma as any).projectInvite.upsert({
      where: { projectId_email: { projectId, email } },
      update: {
        projectRole: prismaRole,
        tokenHash,
        expiresAt,
        status: "PENDING"
      },
      create: {
        projectId,
        email,
        projectRole: prismaRole,
        tokenHash,
        expiresAt
      }
    });

    // Send invitation email
    try {
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

            <p style="font-size:14px;color:#555">
              Click the button below to accept the invitation and access the project.
            </p>

            <div style="margin:25px 0;text-align:center">
              <a href="${inviteLink}"
                 style="
                 background:#6366f1;
                 color:white;
                 padding:12px 24px;
                 text-decoration:none;
                 border-radius:6px;
                 font-weight:600;
                 display:inline-block;">
                 Accept Invitation
              </a>
            </div>

            <p style="font-size:12px;color:#888">
              If the button doesn't work copy this link:
            </p>

            <p style="font-size:12px;color:#6366f1">
              ${inviteLink}
            </p>

          </div>
        </div>
        `
      });
    } catch (error) {
      console.error('Failed to send invite email:', error);
    }

    return { message: 'Invitation sent successfully', email, projectRole: prismaRole };
  } catch (dbError: any) {
    console.error('Database error in inviteMember:', dbError);
    throw new Error(`Database error: ${dbError.message}`);
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
  const tokenHash = sha256(token);
  const invite = await (prisma as any).projectInvite.findUnique({
    where: { tokenHash },
    include: { project: true }
  });

  if (!invite || invite.status === "ACCEPTED" || invite.expiresAt < new Date()) {
    throw new Error('Invalid or expired invitation link');
  }

  const project = invite.project;
  if (!project) throw new Error('Project not found');

  // Check if user exists by invite email
  const existingUserByEmail = await (prisma as any).user.findUnique({ where: { email: invite.email } });

  // If userId is provided, it means the user is logged in and accepting
    if (userId) {
      console.log("[ACCEPT INVITE] user:", userId, "project:", invite.projectId);
      
      // Create or update ProjectMember entry for the logged-in user
      const projectId = invite.projectId;
      const projectRole = mapLegacyRole(invite.projectRole);
  
      await (prisma as any).projectMember.upsert({
        where: { 
          userId_projectId: { 
            userId, 
            projectId 
          } 
        },
        update: { 
          projectRole 
        },
        create: {
          userId,
          projectId,
          projectRole
        }
      });
  
      console.log("[PROJECT MEMBER CREATED]", { 
        userId, 
        projectId, 
        projectRole 
      });
  
    // Mark project invite as accepted
    await (prisma as any).projectInvite.update({
      where: { id: invite.id },
      data: { 
        status: "ACCEPTED"
      }
    });
  
    // Requirement 10: Log invite acceptance
    console.log(`[INVITE ACCEPTANCE] User: ${userId}, Project: ${invite.projectId}, Role: ${projectRole}`);

  // Mark organization invite as active in the legacy Invite table
    const orgInvite = await (prisma as any).invite.findFirst({
      where: { organizationId: invite.project.organizationId, email: invite.email }
    });

    if (orgInvite) {
      await (prisma as any).invite.update({
        where: { id: orgInvite.id },
        data: { status: "active" }
      });
    }

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

