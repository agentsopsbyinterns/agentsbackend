// Beginner-friendly in-memory user store
// For demo only (resets on server restart)
const users = [];

// Helper: build a unique ID for any provider
function buildId(provider, key) {
  return `${provider}:${key}`;
}

// Create or find an OAuth user (Google/Facebook)
function findOrCreateOAuthUser({ provider, oauthId, name, email, photo }) {
  const id = buildId(provider, oauthId);
  let user = users.find(u => u.id === id);
  if (!user) {
    user = { id, provider, name, email: email || null, photo: photo || null };
    users.push(user);
  } else {
    // Keep profile up to date
    user.name = name || user.name;
    user.email = email || user.email;
    user.photo = photo || user.photo;
  }
  return user;
}

// Create a Local user (email/password)
function createLocalUser({ name, email, passwordHash }) {
  const normalizedEmail = email.toLowerCase();
  if (users.find(u => u.provider === 'local' && u.email === normalizedEmail)) {
    throw new Error('Email already registered');
  }
  const id = buildId('local', normalizedEmail);
  const user = { id, provider: 'local', name, email: normalizedEmail, photo: null, passwordHash };
  users.push(user);
  return user;
}

function findLocalUserByEmail(email) {
  const normalizedEmail = email.toLowerCase();
  return users.find(u => u.provider === 'local' && u.email === normalizedEmail) || null;
}

function findById(id) {
  return users.find(u => u.id === id) || null;
}

module.exports = {
  users,
  findOrCreateOAuthUser,
  createLocalUser,
  findLocalUserByEmail,
  findById,
};

