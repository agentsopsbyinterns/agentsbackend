
import { prisma } from '../../prisma/client';
import { ProjectRole } from '@prisma/client';
import { sendMail } from '../../common/utils/mailer';
import { env } from '../../config/env';
import { generateRandomToken, sha256 } from '../../common/utils/tokens';

// Helper to find an existing user by email, or create a new one if they don't exist in the org
async function findOrCreateUserByEmail(email: string, orgId: string) {
  if (!email) throw new Error('Email is required');
  if (!orgId) throw new Error('Organization ID is required');
  
  try {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // If user doesn't exist at all, create them and associate with the org
      user = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0], // Default name from email prefix
          organizationId: orgId,
          passwordHash: 'INVITED_USER', // Added passwordHash for invited users
          role: 'MEMBER',
          globalRole: 'TEAM_MEMBER',
        },
      });
    } else if (!user.organizationId) {
      // If user exists but is not part of any org, assign them to this one
      user = await prisma.user.update({
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
  console.log('getProjectMembers called with projectId:', projectId);
  if (!projectId || projectId === 'undefined' || projectId === 'null') {
    console.error('Invalid projectId in getProjectMembers');
    return { members: [], invites: [] };
  }
  
  try {
    const [members, invites] = await Promise.all([
      (prisma.projectMember as any).findMany({
        where: { projectId: projectId },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
      prisma.projectInvite.findMany({
        where: { 
          projectId: projectId,
          used: false,
          expiresAt: { gt: new Date() }
        }
      })
    ]);
    
    console.log(`Found ${members.length} members and ${invites.length} invites for project ${projectId}`);
    return { members, invites };
  } catch (error: any) {
    console.error('Error in getProjectMembers findMany:', error);
    // If it fails with the weird projectId error, try the relation way
    try {
      console.log('Retrying getProjectMembers with relation where clause');
      const [members, invites] = await Promise.all([
        (prisma.projectMember as any).findMany({
          where: { project: { id: projectId } },
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        }),
        prisma.projectInvite.findMany({
          where: { 
            project: { id: projectId },
            used: false,
            expiresAt: { gt: new Date() }
          }
        })
      ]);
      return { members, invites };
    } catch (retryError) {
      console.error('Retry failed:', retryError);
      throw error;
    }
  }
}

// Invite a new member to a project
function mapToPrismaProjectRole(role: string | undefined | null): ProjectRole {
  const r = String(role || '').toUpperCase();
  if (r === 'OWNER') return 'OWNER' as unknown as ProjectRole;
  if (r === 'CONTRIBUTOR') return 'CONTRIBUTOR' as unknown as ProjectRole;
  if (r === 'VIEWER') return 'VIEWER' as unknown as ProjectRole;
  // Map non-enum UI roles to closest enum (contributor/editor)
  if (r === 'ADMIN' || r === 'PROJECT_MANAGER') return 'CONTRIBUTOR' as unknown as ProjectRole;
  return 'VIEWER' as unknown as ProjectRole;
}

export async function inviteMember(projectId: string, orgId: string, email: string, role: string) {
  console.log('inviteMember called with:', { projectId, orgId, email, role });
  
  // Fetch project name for the email
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true }
  });

  const user = await findOrCreateUserByEmail(email, orgId);
  console.log('findOrCreateUserByEmail result:', user);
  
  try {
    const existing = await (prisma.projectMember as any).findFirst({
      where: {
        userId: user.id,
        projectId: projectId,
      },
    });

    if (existing) {
      console.log('User already in project');
      return { message: 'User already in project' };
    }

    const prismaRole = mapToPrismaProjectRole(role);
    console.log('prismaRole to use:', prismaRole);

    // If user already exists (not a newly invited placeholder), create membership immediately
    if (user.passwordHash && user.passwordHash !== 'INVITED_USER') {
      await (prisma.projectMember as any).upsert({
        where: { userId_projectId: { userId: user.id, projectId } },
        update: { projectRole: prismaRole },
        create: { userId: user.id, projectId, projectRole: prismaRole }
      });
      try {
        const projectLink = `${env.APP_URL}/projects/${projectId}`;
        const projectName = project?.name || "a project";
        await sendMail({
          to: email,
          subject: "You’ve been added to a project",
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;background:#f9fafb;padding:30px">
              <div style="max-width:500px;margin:auto;background:white;padding:30px;border-radius:10px;border:1px solid #eee">
                <h2 style="margin-top:0;color:#111">AgentOps</h2>
                <p style="font-size:16px;color:#333">You have been added to <strong>${projectName}</strong> as <strong>${String(prismaRole)}</strong>.</p>
                <div style="margin:25px 0;text-align:center">
                  <a href="${projectLink}" style="background:#6366f1;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">Open Project</a>
                </div>
              </div>
            </div>
          `
        });
      } catch (e) {
        console.error('Failed to send member added email:', e);
      }
      return { message: 'Member added to project', member: { userId: user.id, projectId, projectRole: prismaRole } };
    }

    // Create a ProjectInvite record with a token
    const token = generateRandomToken(32);
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

    await prisma.projectInvite.upsert({
      where: { projectId_email: { projectId, email } },
      update: {
        projectRole: prismaRole,
        tokenHash,
        expiresAt,
        used: false
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

    // We don't create the ProjectMember here anymore, it's created on acceptance
    // But for now, let's return a status
    return { message: 'Invitation sent successfully', email };
  } catch (dbError: any) {
    console.error('Database error in inviteMember:', dbError);
    throw new Error(`Database error: ${dbError.message}`);
  }
}

// Remove a member from a project
export async function removeMember(projectId: string, memberId: string) {
  // Try finding in ProjectMember first
  const member = await (prisma.projectMember as any).findUnique({
    where: { id: memberId },
  });
  
  if (member) {
    if (member.projectId !== projectId) {
      throw new Error('Project member not found in this project.');
    }
    return (prisma.projectMember as any).delete({ where: { id: memberId } });
  }

  // If not found, try finding in ProjectInvite
  const invite = await prisma.projectInvite.findUnique({
    where: { id: memberId },
  });

  if (invite) {
    if (invite.projectId !== projectId) {
      throw new Error('Project invitation not found in this project.');
    }
    return prisma.projectInvite.delete({ where: { id: memberId } });
  }

  throw new Error('Project member or invitation not found.');
}

// Update a member's role
export async function updateMemberRole(projectId: string, memberId: string, role: string) {
  const prismaRole = mapToPrismaProjectRole(role);

  // Try updating ProjectMember first
  const member = await (prisma.projectMember as any).findUnique({
    where: { id: memberId },
  });

  if (member) {
    if (member.projectId !== projectId) {
      throw new Error('Project member not found in this project.');
    }
    return (prisma.projectMember as any).update({
      where: { id: memberId },
      data: { projectRole: prismaRole },
    });
  }

  // If not found, try updating ProjectInvite
  const invite = await prisma.projectInvite.findUnique({
    where: { id: memberId },
  });

  if (invite) {
    if (invite.projectId !== projectId) {
      throw new Error('Project invitation not found in this project.');
    }
    return prisma.projectInvite.update({
      where: { id: memberId },
      data: { projectRole: prismaRole },
    });
  }

  throw new Error('Project member or invitation not found.');
}

// Accept a project invitation
export async function acceptProjectInvite(token: string) {
  const tokenHash = sha256(token);
  const invite = await prisma.projectInvite.findUnique({
    where: { tokenHash },
    include: { project: true }
  });

  if (!invite || invite.used || invite.expiresAt < new Date()) {
    throw new Error('Invalid or expired invitation link');
  }

  const project = invite.project;
  if (!project) throw new Error('Project not found');

  let user = await prisma.user.findUnique({ where: { email: invite.email } });

  // If user doesn't exist, we don't create them here, we let the frontend handle signup
  // If user exists, we add them to the project
  if (user) {
    await (prisma.projectMember as any).upsert({
      where: { userId_projectId: { userId: user.id, projectId: invite.projectId } },
      update: { projectRole: invite.projectRole },
      create: {
        userId: user.id,
        projectId: invite.projectId,
        projectRole: invite.projectRole
      }
    });

    // Mark invite as used
    await prisma.projectInvite.update({
      where: { id: invite.id },
      data: { used: true }
    });

    return { success: true, projectId: invite.projectId, userExists: true };
  }

  // If user doesn't exist, we just return the invite details so the frontend can pre-fill signup
  return { 
    success: true, 
    projectId: invite.projectId, 
    userExists: false, 
    email: invite.email,
    role: invite.projectRole,
    organizationId: project.organizationId
  };
}
