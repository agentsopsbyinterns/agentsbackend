import * as bcrypt from 'bcrypt';

export async function hashPassword(password: string) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(hash: string, password: string) {
  return bcrypt.compare(password, hash);
}
