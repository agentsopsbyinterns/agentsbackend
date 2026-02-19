import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { jwtConfig } from '../../config/jwt';

export function signAccessToken(payload: object) {
  return (jwt as any).sign(payload as any, jwtConfig.access.secret as Secret, { expiresIn: jwtConfig.access.expiresIn } as SignOptions);
}

export function signRefreshToken(payload: object) {
  return (jwt as any).sign(payload as any, jwtConfig.refresh.secret as Secret, { expiresIn: jwtConfig.refresh.expiresIn } as SignOptions);
}

export function verifyAccessToken(token: string) {
  return (jwt as any).verify(token, jwtConfig.access.secret as Secret);
}

export function verifyRefreshToken(token: string) {
  return (jwt as any).verify(token, jwtConfig.refresh.secret as Secret);
}

export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}
