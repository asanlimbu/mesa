/**
 * Environment configuration, read once at startup.
 *
 * Every setting has a development default so `npm run dev` works on a fresh
 * clone with no setup. Production is held to a stricter standard: the server
 * refuses to boot with the development JWT secret, because a predictable secret
 * means anyone can mint a valid admin token.
 */

import 'dotenv/config';

const DEV_SECRET = 'dev-secret-change-me';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const jwtSecret = process.env.JWT_SECRET ?? DEV_SECRET;

if (isProduction && (jwtSecret === DEV_SECRET || jwtSecret.length < 32)) {
  throw new Error(
    'JWT_SECRET must be set to a strong value (32+ characters) in production.',
  );
}

export const config = Object.freeze({
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
  jwt: Object.freeze({
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  }),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  bcryptRounds: 10,
});
