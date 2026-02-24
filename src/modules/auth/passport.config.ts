import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy, Profile as FacebookProfile } from 'passport-facebook';
import { prisma } from '../../prisma/client';
import { env } from '../../config/env';

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

function ensureUserForProvider(provider: 'google' | 'facebook', profile: OAuthProfile) {
  return (async () => {
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
        return prisma.user.update({
          where: { id: existingByEmail.id },
          data: { [providerIdField]: providerIdValue } as any
        });
      }
    }

    const orgName =
      (profile.displayName && `${profile.displayName}'s Org`) ||
      (email && `${email.split('@')[0]}'s Org`) ||
      `${provider.toUpperCase()} User Org`;

    const organization = await prisma.organization.create({
      data: { name: orgName }
    });

    const created = await prisma.user.create({
      data: {
        email: email || `${provider}-${providerIdValue}@example.com`,
        name: profile.displayName || email || providerIdValue,
        passwordHash: 'oauth',
        organizationId: organization.id,
        role: 'ADMIN',
        [providerIdField]: providerIdValue
      } as any
    });
    return created;
  })();
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
          callbackURL: '/auth/google/callback'
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

