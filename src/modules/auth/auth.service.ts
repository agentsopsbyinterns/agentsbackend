import { prisma } from '../../prisma/client.js';
import { InviteStatus, Prisma } from '@prisma/client';
import { SignupInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schema.js';
import { hashPassword, verifyPassword } from '../../common/utils/password.js';
import { generateRandomToken, sha256, signAccessToken } from '../../common/utils/tokens.js';
import { mapLegacyRole } from '../../common/utils/roles.js';
import { badRequest, conflict, notFound, unauthorized } from '../../common/errors/api-error.js';
import { sendMail } from '../../common/utils/mailer.js';
import { env } from '../../config/env.js';
import crypto from 'crypto';

export async function signup(input: SignupInput & { organizationId?: string; projectId?: string; token?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already in use. Please log in instead.');
  }

  const passwordHash = await hashPassword(input.password);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const verificationExpires = new Date(Date.now() + 1000 * 60 * 10); // 10 minutes for OTP

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let orgId = input.organizationId;
    let invite = null;

    // If a token is provided, prioritize the organization from the invite
    if (input.token) {
      const tokenHash = sha256(input.token);
      invite = await (tx.projectInvite as any).findUnique({ where: { tokenHash } });
      
      if (!invite || invite.status !== InviteStatus.PENDING || invite.expiresAt < new Date()) {
        throw badRequest('Invalid or expired invitation token');
      }
      
      orgId = invite.organizationId;
    }

    let org;
    if (!orgId) {
      if (!input.organizationName) {
        throw badRequest('Organization name is required for standard signup');
      }
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
        globalRole: orgId ? 'TEAM_MEMBER' : 'ADMIN',
        verificationToken: otp,
        verificationExpires,
        isVerified: false
      }
    });

    // If we have a valid invite, handle project membership and mark as accepted
    if (invite && invite.status === InviteStatus.PENDING && invite.expiresAt > new Date()) {
      const projectRole = mapLegacyRole(invite.projectRole || 'CONTRIBUTOR');
      
      if (invite.projectId) {
        await (tx.projectMember as any).upsert({
          where: { userId_projectId: { userId: user.id, projectId: invite.projectId } },
          update: { projectRole },
          create: {
            userId: user.id,
            projectId: invite.projectId,
            projectRole,
            joinedAt: new Date()
          }
        });
      }
      
      await (tx.projectInvite as any).update({ 
        where: { id: invite.id }, 
        data: { 
          status: InviteStatus.ACCEPTED
        } 
      });
    }

    return { org, user };
  });

  await sendMail({
    to: result.user.email,
    subject: "Verify your email - AgentOps AI",
    html: `
      <h2>Email Verification</h2>
      <p>Thank you for signing up! Your verification code is:</p>
      <h1 style="font-size: 32px; letter-spacing: 5px; color: #4f46e5; text-align: center; background: #f3f4f6; padding: 20px; border-radius: 8px;">${otp}</h1>
      <p>This code will expire in 10 minutes.</p>
    `
  });

  return {
    user: sanitizeUser(result.user),
    message: 'Check your email for the verification code'
  };
}

export async function verifyOTP(email: string, otp: string) {
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    throw notFound('User not found');
  }

  if (user.isVerified) {
    throw badRequest('Email already verified. Please log in.');
  }

  if (user.verificationToken !== otp) {
    throw badRequest('Invalid verification code');
  }

  if (user.verificationExpires && user.verificationExpires < new Date()) {
    throw badRequest('Verification code expired');
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      isVerified: true,
      verificationToken: null,
      verificationExpires: null
    }
  });

  const accessToken = signAccessToken({
    sub: updatedUser.id,
    email: updatedUser.email,
    organizationId: updatedUser.organizationId,
    globalRole: (updatedUser as any).globalRole || 'TEAM_MEMBER'
  });
  const rawRefresh = generateRandomToken(32);
  const refreshHash = sha256(rawRefresh);
  const refreshExpires = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_TTL));
  await prisma.refreshToken.create({
    data: { userId: updatedUser.id, tokenHash: refreshHash, expiresAt: refreshExpires }
  });

  return { user: sanitizeUser(updatedUser), accessToken, refreshCookieValue: rawRefresh };
}

export async function login(input: LoginInput & { projectId?: string; token?: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw unauthorized('Invalid credentials');
  
  if (!user.isVerified) {
    throw unauthorized('Please verify your email before login');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw unauthorized('Invalid credentials');

  // Handle invite token during login if present
  if (input.token && input.projectId) {
    const tokenHash = sha256(input.token);
    console.log(`[login/invite] Checking tokenHash: ${tokenHash} for project: ${input.projectId}`);
    const invite = await (prisma as any).projectInvite.findUnique({ where: { tokenHash } });
    
    if (invite && invite.status === InviteStatus.PENDING && invite.expiresAt > new Date()) {
       // Verify it's for this project (unless it's an org invite where projectId is null)
       if (!invite.projectId || invite.projectId === input.projectId) {
         const projectRole = mapLegacyRole(invite.projectRole || 'CONTRIBUTOR');
         
         await (prisma as any).$transaction([
           // Only create membership if it's a project invite
           ...(invite.projectId ? [(prisma as any).projectMember.upsert({
             where: { userId_projectId: { userId: user.id, projectId: invite.projectId } },
             update: { projectRole },
             create: {
               userId: user.id,
               projectId: invite.projectId,
               projectRole,
               joinedAt: new Date()
             }
           })] : []),
           // Always mark invite as accepted
           (prisma as any).projectInvite.update({ 
             where: { id: invite.id }, 
             data: { 
               status: InviteStatus.ACCEPTED
             } 
           })
         ]);
         
         console.log(`[login/invite] User ${user.id} joined project ${invite.projectId || 'org'} via token`);
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
