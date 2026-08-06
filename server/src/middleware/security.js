/**
 * Rate limiting.
 *
 * Two tiers, because the endpoints have very different risk profiles.
 *
 * Sign-in and registration are the ones worth attacking: an unthrottled login
 * endpoint is an offline password cracker with a network hop in front of it.
 * Those get a tight limit counted only against *failed* attempts, so a person
 * legitimately signing in on several devices is never punished.
 *
 * Everything else gets a loose ceiling that a real user will not reach but a
 * script will.
 */

import rateLimit from 'express-rate-limit';

import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

/** Shared handler so a throttled caller gets the same error shape as anything else. */
function tooManyRequests(_req, _res, next) {
  next(
    new AppError(
      429,
      'RATE_LIMITED',
      'Too many attempts. Please wait a few minutes and try again.',
    ),
  );
}

const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooManyRequests,
  // The test suite fires hundreds of requests in seconds; throttling it would
  // only test the limiter.
  skip: () => config.isTest,
};

/** Credential endpoints: 10 failures per 15 minutes per IP. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

/** Writes: enough for real use, far below what a script would want. */
export const writeLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 30,
});

/** Everything else. */
export const generalLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 300,
});
