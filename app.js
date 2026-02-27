// Load environment variables from .env
require('dotenv').config();

// Core dependencies
const path = require('path');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const authRouter = require('./routes/auth');
const { sequelize, testConnection } = require('./config/db');
const User = require('./models/User');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Parse form bodies for login/register
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session management
// Stores session data in memory (sufficient for demo purposes)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_session_secret',
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport and restore authentication state, if any, from the session
require('./passport'); // configures strategies and serialization
app.use(passport.initialize());
app.use(passport.session());

// Combined auth guard: allows either Passport or DB session
function ensureAnyAuth(req, res, next) {
  if ((req.isAuthenticated && req.isAuthenticated()) || (req.session && req.session.userId)) {
    return next();
  }
  res.redirect('/login');
}

// Home route with "Login with Google" button
app.get('/', (req, res) => {
  const error = req.query.error || null;
  const facebookEnabled = Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  res.render('home', { user: req.user || null, error, facebookEnabled });
});

// Start Google OAuth flow
app.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=google_auth_failed' }),
  (req, res) => {
    res.redirect('/profile');
  }
);

// Facebook routes only if configured
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  app.get(
    '/auth/facebook',
    passport.authenticate('facebook', { scope: ['email', 'public_profile'] })
  );
  app.get(
    '/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/?error=facebook_auth_failed' }),
    (req, res) => {
      res.redirect('/profile');
    }
  );
}

// Mount DB-backed auth routes (register, login, profile, logout)
app.use('/', authRouter);

const invitationsRouter = require('./routes/invitations');
app.use('/invitations', invitationsRouter);

// Profile route (protected)
app.get('/profile', ensureAnyAuth, async (req, res) => {
  // If DB session exists, load from DB; otherwise fall back to Passport user
  if (req.session && req.session.userId) {
    const dbUser = await User.findByPk(req.session.userId);
    if (dbUser) {
      return res.render('profile', {
        name: dbUser.name,
        email: dbUser.email,
        photo: null,
        provider: 'local-db',
      });
    }
  }
  const user = req.user;
  res.render('profile', {
    name: user?.name || 'Unknown',
    email: user?.email || 'Email not available',
    photo: user?.photo || null,
    provider: user?.provider || 'unknown',
  });
});

// Logout route
app.get('/logout', (req, res) => {
  // passport 0.6+ logout is async
  req.logout(err => {
    if (err) {
      return res.status(500).send('Logout error');
    }
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

// Start server
app.listen(PORT, async () => {
  await testConnection();
  await sequelize.sync({ alter: false });
  console.log(`Server listening on http://localhost:${PORT}`);
});

