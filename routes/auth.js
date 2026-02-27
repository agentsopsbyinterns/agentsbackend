const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect('/login');
}

router.get('/register', (req, res) => {
  const error = req.query.error || null;
  res.render('register', { error });
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.redirect('/register?error=missing_fields');
    }
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.redirect('/register?error=email_taken');
    }
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const user = await User.create({ name, email, password: passwordHash });
    req.session.userId = user.id;
    return res.redirect('/profile');
  } catch (e) {
    return res.redirect('/register?error=server_error');
  }
});

router.get('/login', (req, res) => {
  const error = req.query.error || null;
  res.render('login', { error });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.redirect('/login?error=missing_fields');
    }
    const user = await User.findOne({ where: { email } });
    if (!user) return res.redirect('/login?error=invalid_credentials');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.redirect('/login?error=invalid_credentials');
    req.session.userId = user.id;
    return res.redirect('/profile');
  } catch (e) {
    return res.redirect('/login?error=server_error');
  }
});

router.get('/profile', requireLogin, async (req, res) => {
  const user = await User.findByPk(req.session.userId);
  if (!user) {
    req.session.destroy(() => res.redirect('/login'));
    return;
  }
  res.render('profile', {
    name: user.name,
    email: user.email,
    photo: null,
    provider: 'local-db',
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;

