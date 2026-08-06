/**
 * Terminal error handling.
 *
 * Deliberate rejections (AppError) are serialised with their status and code.
 * Everything else is a bug: it is logged in full server-side and reported to
 * the client as a bare 500, because stack traces and Prisma messages leak
 * schema details and file paths.
 */

import { AppError } from '../lib/errors.js';
import { config } from '../config.js';

export function notFoundHandler(req, _res, next) {
  next(
    new AppError(404, 'ROUTE_NOT_FOUND', `Cannot ${req.method} ${req.originalUrl}`),
  );
}

// Express identifies error middleware by arity, so `next` must stay declared.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, _next) {
  /**
   * Attach the request id to every failure.
   *
   * It is the only handle a user has on a specific request, so it has to reach
   * them — otherwise "it broke" cannot be traced to a log line.
   */
  const withRequestId = (body) => ({
    ...body,
    error: { ...body.error, requestId: req.id },
  });

  if (error instanceof AppError) {
    return res.status(error.status).json(withRequestId(error.toJSON()));
  }

  // Unique constraint violation — the only Prisma error worth translating,
  // because it is a user-facing outcome rather than a bug.
  if (error?.code === 'P2002') {
    return res.status(409).json({
      error: {
        code: 'ALREADY_EXISTS',
        message: 'That record already exists.',
        details: { fields: error.meta?.target ?? [] },
      },
    });
  }

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON.' },
    });
  }

  console.error('[unhandled]', error);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side.',
      ...(config.isProduction ? {} : { details: { message: error?.message } }),
    },
  });
}

/**
 * Wrap an async handler so a rejected promise reaches the error middleware.
 *
 * Express 5 forwards rejections automatically, but wrapping keeps the intent
 * explicit and the handlers free of try/catch.
 */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
