// Passport configuration for multiple strategies
require('dotenv').config();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const {
  findOrCreateOAuthUser,
  createLocalUser,
  findLocalUserByEmail,
  findById,
} = require('./users');

// Google OAuth 2.0 strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: '/auth/google/callback',
    },
    (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const photo = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
        const user = findOrCreateOAuthUser({
          provider: 'google',
          oauthId: profile.id,
          name: profile.displayName || 'Google User',
          email,
          photo,
        });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Facebook OAuth 2.0 strategy (only if configured)
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: '/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'photos', 'emails'],
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const photo = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
          const user = findOrCreateOAuthUser({
            provider: 'facebook',
            oauthId: profile.id,
            name: profile.displayName || 'Facebook User',
            email,
            photo,
          });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

// Local email/password strategy
passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = findLocalUserByEmail(email);
        if (!user || !user.passwordHash) {
          return done(null, false, { message: 'Invalid email or password' });
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          return done(null, false, { message: 'Invalid email or password' });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Serialize user to the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser((id, done) => {
  try {
    const user = findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
