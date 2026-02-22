import { prisma } from '../../prisma/client';
import type { Prisma } from '@prisma/client';
import { SignupInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schema';
import { hashPassword, verifyPassword } from '../../common/utils/password';
import { generateRandomToken, sha256, signAccessToken } from '../../common/utils/tokens';
import { badRequest, conflict, notFound, unauthorized } from '../../common/errors/api-error';
import { sendMail } from '../../common/utils/mailer';
import { env } from '../../config/env';

export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already in use');
  }
  const passwordHash = await hashPassword(input.password);
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const org = await tx.organization.create({ data: { name: input.organizationName } });
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        organizationId: org.id,
        role: 'ADMIN'
      }
    });
    return { org, user };
  });

  const accessToken = signAccessToken({
    sub: result.user.id,
    email: result.user.email,
    organizationId: result.user.organizationId,
    role: result.user.role
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

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw unauthorized('Invalid credentials');
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw unauthorized('Invalid credentials');

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role
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
    role: user.role
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
