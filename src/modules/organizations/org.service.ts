import { prisma } from '../../prisma/client';
import { CreateOrgInput, InviteInput } from './org.schema';
import { audit } from '../../common/utils/audit';

export async function createOrganization(userId: string, input: CreateOrgInput) {
  const org = await prisma.organization.create({ data: { name: input.name } });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { organizationId: org.id }
  });
  await audit(org.id, 'organization.create', userId, { name: input.name });
  return { org, user };
}

export async function createInvite(orgId: string, input: InviteInput) {
  const invite = await prisma.invite.upsert({
    where: { organizationId_email: { organizationId: orgId, email: input.email } },
    update: { status: 'pending' },
    create: { organizationId: orgId, email: input.email }
  });
  await audit(orgId, 'invite.create', undefined, { email: input.email });
  return invite;
}
