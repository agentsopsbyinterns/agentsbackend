<<<<<<< HEAD
import { env } from './env.js';
=======
import { env } from './env';
>>>>>>> origin/main

export const jwtConfig = {
  access: {
    secret: env.JWT_ACCESS_SECRET,
    expiresIn: env.ACCESS_TOKEN_TTL,
    algorithm: 'HS256' as const
  },
  refresh: {
    secret: env.JWT_REFRESH_SECRET,
    expiresIn: env.REFRESH_TOKEN_TTL,
    algorithm: 'HS256' as const
  }
};
