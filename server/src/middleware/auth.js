/**
 * Authentication and authorisation middleware.
 *
 * Deliberately two separate concerns:
 *   authenticate — who are you?      (401 when unknown)
 *   authorize    — may you do this?  (403 when known but not permitted)
 *
 * Neither answers "may you touch *this particular* record?". That is ownership,
 * and it depends on the record, so it is enforced in the services — see
 * assertOwnsRestaurant in restaurant.service.js.
 */

import { prisma } from '../db.js';
import { bearerFrom, verifyToken } from '../lib/token.js';
import { unauthorized, forbidden } from '../lib/errors.js';

/**
 * Verify the bearer token and attach the current user.
 *
 * The user is loaded from the database rather than trusted from the token, so
 * a deleted account cannot keep acting on a still-valid token.
 */
export async function authenticate(req, _res, next) {
  try {
    const token = bearerFrom(req.headers.authorization);
    const { userId } = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) throw unauthorized('Your account no longer exists.');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Attach the user when a token is present, but allow the request through when
 * it is not. Used by restaurant browsing, which is public but richer when
 * signed in.
 */
export async function optionalAuthenticate(req, _res, next) {
  const token = bearerFrom(req.headers.authorization);
  if (!token) return next();

  try {
    const { userId } = verifyToken(token);
    req.user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  } catch {
    // An invalid token on an optional route is simply an anonymous visitor.
  }
  next();
}

/**
 * Restrict a route to particular roles. Must run after `authenticate`.
 *
 * @param {...string} roles
 */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden('Your account type cannot perform this action.'));
    }
    next();
  };
}
