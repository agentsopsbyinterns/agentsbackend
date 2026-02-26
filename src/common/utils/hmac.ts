import crypto from 'crypto';
import { env } from '../../config/env';

export function verifyHmacSignature(payload: string, signature: string) {
  const hmac = crypto.createHmac('sha256', env.HMAC_SECRET);
  hmac.update(payload);
  const digest = hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
