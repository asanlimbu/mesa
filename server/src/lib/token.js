/**
 * JWT issue and verify.
 *
 * The token carries only the user id and role. Anything else — name, email —
 * is read from the database on demand, so a stale token can never present
 * outdated identity data, and the token stays small.
 */

import jwt from 'jsonwebtoken';

import { config } from '../config.js';
import { unauthorized } from './errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * @returns {{ userId: string, role: string }}
 * @throws {AppError} 401 when the token is missing, malformed or expired
 */
export function verifyToken(token) {
  if (!token) throw unauthorized();

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    return { userId: payload.sub, role: payload.role };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw unauthorized('Your session has expired. Please sign in again.');
    }
    throw unauthorized('Invalid authentication token.');
  }
}

/** Pull a bearer token out of an Authorization header. */
export function bearerFrom(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const [scheme, token] = headerValue.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
