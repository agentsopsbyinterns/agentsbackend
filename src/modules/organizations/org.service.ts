import { prisma } from '../../prisma/client';
import { CreateOrgInput, InviteInput } from './org.schema';
import { audit } from '../../common/utils/audit';
import crypto from 'crypto';
import { sendMail } from '../../common/utils/mailer';
import { env } from '../../config/env';

function base64url(input: Buffer) {
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function sign(payload: string) {
  const h = crypto.createHmac('sha256', env.HMAC_SECRET);
  h.update(payload);
  return h.digest('hex');
}

function createInviteToken(orgId: string, email: string, ttlMs: number) {
  const data = { orgId, email, exp: Date.now() + ttlMs };
  const payload = base64url(Buffer.from(JSON.stringify(data)));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifyInviteToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  if (typeof decoded.exp !== 'number' || decoded.exp < Date.now()) return null;
  return decoded as { orgId: string; email: string; exp: number };
}

export async function createOrganization(userId: string, input: CreateOrgInput) {
  const org = await prisma.organization.create({ data: { name: input.name } });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { organizationId: org.id }
  });
  await audit(org.id, 'organization.create', userId, { name: input.name });
  return { org, user };
}

export async function createInvite(orgId: string, input: InviteInput & { inviterName: string }) {
  const invite = await prisma.invite.upsert({
    where: { organizationId_email: { organizationId: orgId, email: input.email } },
    update: { status: 'pending' },
    create: { organizationId: orgId, email: input.email }
  });
  await audit(orgId, 'invite.create', undefined, { email: input.email });
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const base = 'http://localhost:5173';
  const token = createInviteToken(orgId, input.email, 1000 * 60 * 60 * 24 * 7);
  const link = `${base}/accept-invite?token=${token}`;
  const orgName = org?.name || 'Your Organization';
  const text = `You're invited to join ${orgName}. Click this link to accept: ${link}`;
  const html = `<div style="font-family:Arial,sans-serif;padding:20px;line-height:1.6;color:#111">
    <h2 style="margin:0 0 12px 0">You're invited to join ${orgName}</h2>
    <p style="margin:0 0 16px 0">You have been invited by <strong>${input.inviterName}</strong> to join the workspace.</p>
    <p style="margin:0 0 16px 0">
      <a href="${link}" style="display:inline-block;background:#6366F1;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600" target="_blank" rel="noopener noreferrer">
        Accept Invite
      </a>
    </p>
    <p style="margin-top:20px;font-size:12px;color:#666">
      If the button does not work, copy this link:<br />
      <span style="word-break:break-all">${link}</span>
    </p>
  </div>`;
  await sendMail({
    to: input.email,
    subject: `You're invited to join ${orgName}`,
    text,
    html
  });
  return invite;
}

export async function acceptOrgInvite(rawToken: string) {
  const decoded = verifyInviteToken(rawToken);
  if (!decoded) {
    throw new Error('Invalid or expired invite');
  }
  const invite = await prisma.invite.findUnique({
    where: { organizationId_email: { organizationId: decoded.orgId, email: decoded.email } }
  });
  if (!invite || invite.status === 'accepted') {
    throw new Error('Invalid or expired invite');
  }
  const org = await prisma.organization.findUnique({ where: { id: invite.organizationId } });
  if (!org) {
    throw new Error('Organization not found');
  }
  let user = await prisma.user.findUnique({ where: { email: invite.email } });
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: invite.organizationId, role: user.role || 'MEMBER' }
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: invite.email,
        name: invite.email.split('@')[0],
        passwordHash: 'invited',
        organizationId: invite.organizationId,
        role: 'MEMBER'
      }
    });
  }
  await prisma.invite.update({ where: { id: invite.id }, data: { status: 'accepted' } });
  return { organizationId: invite.organizationId, email: invite.email };
}
