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
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationExpires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

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
        globalRole: input.organizationId ? 'TEAM_MEMBER' : 'ADMIN',
        verificationToken,
        verificationExpires,
        isVerified: false
      }
    });

    // ... (rest of the logic remains the same)
    // If we have a project token, add them to the project now
    if (input.token && input.projectId) {
      const tokenHash = sha256(input.token);
      console.log(`[signup/new] Checking tokenHash: ${tokenHash} for project: ${input.projectId}`);
      const invite = await (tx.projectInvite as any).findUnique({ where: { tokenHash } });
      
      if (invite && invite.status === InviteStatus.PENDING && invite.expiresAt > new Date()) {
         // Verify it's for this project (unless it's an org invite where projectId is null)
         if (!invite.projectId || invite.projectId === input.projectId) {
           const projectRole = mapLegacyRole(invite.projectRole || 'CONTRIBUTOR');
           console.log(`[signup/new] Adding user ${user.id} to project ${invite.projectId || 'org'} with role ${projectRole}`);
           
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
      }
    }

    return { org, user };
  });

  const verifyUrl = `${env.APP_URL}/verify-email?token=${verificationToken}`;
  await sendMail({
    to: result.user.email,
    subject: "Verify your email - AgentOps AI",
    html: `
      <h2>Email Verification</h2>
      <p>Thank you for signing up! Please click the link below to verify your email address:</p>
      <p><a href="${verifyUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
      <p>This link will expire in 24 hours.</p>
    `
  });

  return {
    user: sanitizeUser(result.user),
    message: 'Check your email to verify your account'
  };
}

export async function verifyEmail(token: string) {
  // Find user by token even if expired to provide a better message
  const user = await prisma.user.findFirst({
    where: { 
      verificationToken: token
    }
  });

  if (!user) {
    // If we don't find the user, it's either invalid or already verified (token cleared)
    // To handle idempotency, we can't easily know if this specific token was just used.
    // But we'll follow the requirement to be graceful if we can.
    throw badRequest('Invalid or expired verification token');
  }

  if (user.isVerified) {
    return { success: true, message: 'Email already verified' };
  }

  if (user.verificationExpires && user.verificationExpires < new Date()) {
    throw badRequest('Verification token expired');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isVerified: true,
      verificationToken: null,
      verificationExpires: null
    }
  });

  return { success: true };
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
