import { prisma } from '../../prisma/client.js';
import { InviteStatus } from '@prisma/client';
import { CreateOrgInput, InviteInput } from './org.schema.js';
import { audit } from '../../common/utils/audit.js';
import { sendMail } from '../../common/utils/mailer.js';
import { env } from '../../config/env.js';
import { generateRandomToken, sha256 } from '../../common/utils/tokens.js';

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
  const token = generateRandomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  // 1. Check for existing invite to update it, avoiding "null in unique" issues with upsert
  let invite = await (prisma as any).projectInvite.findFirst({
    where: { 
      organizationId: orgId, 
      projectId: null, 
      email: input.email 
    }
  });

  if (invite) {
    invite = await (prisma as any).projectInvite.update({
      where: { id: invite.id },
      data: { 
        status: InviteStatus.PENDING,
        tokenHash,
        expiresAt
      }
    });
  } else {
    invite = await (prisma as any).projectInvite.create({
      data: { 
        organizationId: orgId, 
        projectId: null as any,
        email: input.email, 
        status: InviteStatus.PENDING,
        tokenHash,
        expiresAt
      }
    });
  }

  await audit(orgId, 'invite.create', undefined, { email: input.email });
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const base = env.APP_URL;
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
  // This function is now superseded by the general acceptProjectInvite in members.service.ts
  // But for backward compatibility with existing routes:
  const { acceptProjectInvite } = await import('../members/members.service.js');
  return acceptProjectInvite(rawToken);
}
