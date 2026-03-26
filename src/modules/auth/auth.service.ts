import { prisma } from '../../prisma/client';
import { InviteStatus, type Prisma } from '@prisma/client';
import { SignupInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schema';
import { hashPassword, verifyPassword } from '../../common/utils/password';
import { generateRandomToken, sha256, signAccessToken } from '../../common/utils/tokens';
import { mapLegacyRole, PROJECT_ROLES } from '../../common/utils/roles';
import { badRequest, conflict, notFound, unauthorized } from '../../common/errors/api-error';
import { sendMail } from '../../common/utils/mailer';
import { env } from '../../config/env';

export async function signup(input: SignupInput & { organizationId?: string; projectId?: string; token?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    const raw = (existing as any).passwordHash as string | null | undefined;
    const isPlaceholder = !raw || raw.trim().length === 0 || raw.trim().length < 20;
    if (isPlaceholder) {
      const newHash = await hashPassword(input.password);
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          passwordHash: newHash,
          organizationId: input.organizationId || existing.organizationId
        }
      });

      // If we have a project token, add them to the project now
      if (input.token && input.projectId) {
        const tokenHash = sha256(input.token);
        const invite = await (prisma as any).projectInvite.findUnique({ where: { tokenHash } });
        if (invite && invite.status === InviteStatus.PENDING && invite.expiresAt > new Date() && invite.projectId === input.projectId) {
           const projectRole = mapLegacyRole(invite.projectRole);
           console.log(`[signup/placeholder] Adding existing user ${updated.id} to project ${input.projectId} with role ${projectRole}`);
           const pm = await (prisma as any).projectMember.upsert({
             where: { userId_projectId: { userId: updated.id, projectId: input.projectId } },
             update: { projectRole },
             create: {
               userId: updated.id,
               projectId: input.projectId,
               projectRole
             }
           });
           console.log(`[signup/placeholder] ProjectMember saved:`, { id: pm.id, role: pm.projectRole });
           await (prisma as any).projectInvite.update({ 
             where: { id: invite.id }, 
             data: { 
               status: InviteStatus.ACCEPTED
             } 
           });
        }
      }

      const accessToken = signAccessToken({
        sub: updated.id,
        email: updated.email,
        organizationId: updated.organizationId,
        globalRole: (updated as any).globalRole || 'TEAM_MEMBER'
      });
      const rawRefresh = generateRandomToken(32);
      const refreshHash = sha256(rawRefresh);
      const refreshExpires = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_TTL));
      await prisma.refreshToken.create({
        data: { userId: updated.id, tokenHash: refreshHash, expiresAt: refreshExpires }
      });
      return {
        user: sanitizeUser(updated),
        accessToken,
        refreshCookieValue: rawRefresh
      };
    }
    throw conflict('Email already in use');
  }
  const passwordHash = await hashPassword(input.password);
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let orgId = input.organizationId;
    let org;
    if (!orgId) {
      org = await tx.organization.create({ data: { name: input.organizationName } });
      orgId = org.id;
    } else {
      org = await tx.organization.findUnique({ where: { id: orgId } });
      if (!org) throw notFound('Organization not found');
    }

    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        organizationId: orgId,
        globalRole: input.organizationId ? 'TEAM_MEMBER' : 'ADMIN'
      }
    });

    // If we have a project token, add them to the project now
    if (input.token && input.projectId) {
      const tokenHash = sha256(input.token);
      const invite = await (tx.projectInvite as any).findUnique({ where: { tokenHash } });
      if (invite && invite.status === InviteStatus.PENDING && invite.expiresAt > new Date() && invite.projectId === input.projectId) {
         const projectRole = mapLegacyRole(invite.projectRole);
         console.log(`[signup/new] Adding new user ${user.id} to project ${input.projectId} with role ${projectRole}`);
         const pm = await (tx.projectMember as any).upsert({
           where: { userId_projectId: { userId: user.id, projectId: input.projectId } },
           update: { projectRole },
           create: {
             userId: user.id,
             projectId: input.projectId,
             projectRole
           }
         });
         console.log(`[signup/new] ProjectMember saved:`, { id: pm.id, role: pm.projectRole });
         await (tx.projectInvite as any).update({ 
           where: { id: invite.id }, 
           data: { 
             status: InviteStatus.ACCEPTED
           } 
         });
      }
    }

    return { org, user };
  });

  const accessToken = signAccessToken({
    sub: result.user.id,
    email: result.user.email,
    organizationId: result.user.organizationId,
    globalRole: (result.user as any).globalRole || (input.organizationId ? 'TEAM_MEMBER' : 'ADMIN')
  });
  const rawRefresh = generateRandomToken(32);
  const refreshHash = sha256(rawRefresh);
  const refreshExpires = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_TTL));

  await prisma.refreshToken.create({
    data: { userId: result.user.id, tokenHash: refreshHash, expiresAt: refreshExpires }
  });

  return {
    user: sanitizeUser(result.user),
    accessToken,
    refreshCookieValue: rawRefresh
  };
}

export async function login(input: LoginInput & { projectId?: string; token?: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw unauthorized('Invalid credentials');
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw unauthorized('Invalid credentials');

  if (input.token && input.projectId) {
    const tokenHash = sha256(input.token);
    const invite = await (prisma as any).projectInvite.findUnique({ where: { tokenHash } });
    if (invite && invite.status === InviteStatus.PENDING && invite.expiresAt > new Date() && invite.projectId === input.projectId) {
       const projectRole = mapLegacyRole(invite.projectRole);
       console.log(`[login/invite] Adding user ${user.id} to project ${input.projectId} with role ${projectRole}`);
       await (prisma as any).projectMember.upsert({
         where: { userId_projectId: { userId: user.id, projectId: input.projectId } },
         update: { projectRole },
         create: {
           userId: user.id,
           projectId: input.projectId,
           projectRole
         }
       });
       
       await (prisma as any).projectInvite.update({ 
         where: { id: invite.id }, 
         data: { 
           status: InviteStatus.ACCEPTED
         } 
       });

       // Mark organization invite as active in the legacy Invite table
       const orgInvite = await prisma.invite.findFirst({
         where: { organizationId: user.organizationId || '', email: user.email }
       });
       if (orgInvite) {
         await prisma.invite.update({
           where: { id: orgInvite.id },
           data: { status: InviteStatus.ACTIVE }
         });
       }
    }
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    organizationId: user.organizationId,
    globalRole: (user as any).globalRole || 'TEAM_MEMBER'
  });
  const rawRefresh = generateRandomToken(32);
  const refreshHash = sha256(rawRefresh);
  const refreshExpires = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_TTL));
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refreshHash, expiresAt: refreshExpires }
  });
  return { user: sanitizeUser(user), accessToken, refreshCookieValue: rawRefresh };
}

export async function logout(userId: string, rawRefreshToken?: string) {
  if (rawRefreshToken) {
    const hash = sha256(rawRefreshToken);
    await prisma.refreshToken.deleteMany({ where: { userId, tokenHash: hash } });
  } else {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }
}

export async function refresh(rawRefreshToken: string) {
  const hash = sha256(rawRefreshToken);
  const token = await prisma.refreshToken.findFirst({
    where: { tokenHash: hash, expiresAt: { gt: new Date() } }
  });
  if (!token) throw unauthorized('Invalid refresh token');

  await prisma.refreshToken.delete({ where: { id: token.id } });

  const newRaw = generateRandomToken(32);
  const newHash = sha256(newRaw);
  const refreshExpires = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_TTL));
  await prisma.refreshToken.create({
    data: { userId: token.userId, tokenHash: newHash, expiresAt: refreshExpires }
  });

  const user = await prisma.user.findUnique({ where: { id: token.userId } });
  if (!user) throw notFound('User not found');
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    organizationId: user.organizationId,
    globalRole: (user as any).globalRole || 'TEAM_MEMBER'
  });
  return { accessToken, newRefresh: newRaw };
}

export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) return;
  const raw = generateRandomToken(32);
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt }
  });
  const link = `${env.APP_URL}/reset-password?token=${raw}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your AgentOps AI password',
    html: `<p>Click to reset your password:</p><p><a href="${link}">${link}</a></p>`
  });
}

export async function resetPassword(input: ResetPasswordInput) {
  const tokenHash = sha256(input.token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash }
  });
  if (!record || record.used || record.expiresAt < new Date()) {
    throw badRequest('Invalid or expired token');
  }
  const newHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash: newHash } });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { used: true } });
    await tx.refreshToken.deleteMany({ where: { userId: record.userId } });
  });
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true }
  });
  if (!user) throw notFound('User not found');
  const { passwordHash, ...rest } = user as any;
  return rest;
}

function sanitizeUser(user: { passwordHash: string } & Record<string, any>) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function parseDuration(str: string) {
  const m = /^(\d+)([smhd])$/.exec(str);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return n * mult;
}
