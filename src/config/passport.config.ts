import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy, Profile as FacebookProfile } from 'passport-facebook';
import { prisma } from '../prisma/client';
import { type Prisma } from '@prisma/client';
import { env } from './env';
import { mapLegacyRole } from '../common/utils/roles';

type OAuthProfile = {
  id: string;
  displayName?: string;
  emails?: Array<{ value: string }>;
};

function getEmail(profile: OAuthProfile): string | undefined {
  const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : undefined;
  return email;
}

passport.serializeUser((user: any, done: (err: any, id?: string) => void) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done: (err: any, user?: any) => void) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user || null);
  } catch (err) {
    done(err as any, null);
  }
});

async function ensureUserForProvider(provider: 'google' | 'facebook', profile: OAuthProfile) {
  const email = getEmail(profile);
  const providerIdField = provider === 'google' ? 'googleId' : 'facebookId';
  const providerIdValue = profile.id;

  const existingByProvider = await prisma.user.findFirst({
    where: { [providerIdField]: providerIdValue } as any
  });
  if (existingByProvider) return existingByProvider;

  if (email) {
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      const updated = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { [providerIdField]: providerIdValue } as any
      });
      
      // Check for pending invites for this existing user
      await handlePendingInvites(updated);
      return updated;
    }
  }

  // No existing user found, create new one
  return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Determine if this is the first user overall or in a potential organization
    // For simplicity with OAuth, we usually create a new Org if no invite exists
    
    let organizationId: string;
    let globalRole: 'ADMIN' | 'TEAM_MEMBER' = 'TEAM_MEMBER';

    // Check if there's an invite for this email
    const invite = email ? await tx.projectInvite.findFirst({
      where: { email, status: 'PENDING', expiresAt: { gt: new Date() } },
      include: { project: true }
    }) : null;

    if (invite) {
      organizationId = invite.organizationId;
      globalRole = 'TEAM_MEMBER';
    } else {
      // Create new organization for the first user
      const orgName =
        (profile.displayName && `${profile.displayName}'s Org`) ||
        (email && `${email.split('@')[0]}'s Org`) ||
        `${provider.toUpperCase()} User Org`;

      const organization = await tx.organization.create({
        data: { name: orgName }
      });
      organizationId = organization.id;
      globalRole = 'ADMIN'; // First user in new org is ADMIN
    }

    const created = await tx.user.create({
      data: {
        email: email || `${provider}-${providerIdValue}@example.com`,
        name: profile.displayName || email || providerIdValue,
        passwordHash: 'oauth',
        organizationId: organizationId,
        globalRole: globalRole,
        [providerIdField]: providerIdValue
      } as any
    });

    // If there was an invite, handle it
    if (invite) {
      const projectRole = mapLegacyRole(invite.projectRole);
      await (tx.projectMember as any).upsert({
        where: { userId_projectId: { userId: created.id, projectId: invite.projectId } },
        update: { projectRole },
        create: {
          userId: created.id,
          projectId: invite.projectId,
          projectRole
        }
      });
      await (tx.projectInvite as any).update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' }
      });
      console.log('[INVITE MEMBERSHIP CREATED]', created.id, invite.projectId);
    }

    return created;
  });
}

async function handlePendingInvites(user: any) {
  if (!user.email) return;
  
  const invites = await prisma.projectInvite.findMany({
    where: { email: user.email, status: 'PENDING', expiresAt: { gt: new Date() } }
  });

  for (const invite of invites) {
    const projectRole = mapLegacyRole(invite.projectRole);
    await (prisma as any).projectMember.upsert({
      where: { userId_projectId: { userId: user.id, projectId: invite.projectId } },
      update: { projectRole },
      create: {
        userId: user.id,
        projectId: invite.projectId,
        projectRole
      }
    });
    await (prisma as any).projectInvite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' }
    });
  }
}

export function setupPassport() {
  const googleOk = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const facebookOk = !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
  if (googleOk) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          callbackURL: (env.GOOGLE_AUTH_CALLBACK as string) || '/auth/google/callback'
        },
        async (_accessToken: string, _refreshToken: string, profile: GoogleProfile, done: (err: any, user?: any) => void) => {
          try {
            const user = await ensureUserForProvider('google', profile);
            done(null, user);
          } catch (err) {
            done(err as any, undefined);
          }
        }
      )
    );
  }

  if (facebookOk) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: env.FACEBOOK_APP_ID as string,
          clientSecret: env.FACEBOOK_APP_SECRET as string,
          callbackURL: '/auth/facebook/callback',
          profileFields: ['id', 'displayName', 'emails']
        },
        async (_accessToken: string, _refreshToken: string, profile: FacebookProfile, done: (err: any, user?: any) => void) => {
          try {
            const user = await ensureUserForProvider('facebook', profile);
            done(null, user);
          } catch (err) {
            done(err as any, undefined);
          }
        }
      )
    );
  }
}

