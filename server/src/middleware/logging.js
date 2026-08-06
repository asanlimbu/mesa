/**
 * Request logging and correlation.
 *
 * Every request gets an id, echoed back on the `X-Request-Id` header and
 * attached to `req.id`. When something fails in production the only thing a
 * user can reliably report is that id, and it has to be enough to find the
 * request in the logs — so the error handler includes it in its response.
 *
 * Logs are JSON in production so a log aggregator can parse them, and a short
 * human line in development so the terminal stays readable. Rolled by hand
 * rather than pulled in: it is thirty lines, and it means one fewer dependency
 * to justify.
 */

import { randomUUID } from 'node:crypto';

import { config } from '../config.js';

/** Paths that would otherwise fill the log with noise. */
const QUIET_PATHS = new Set(['/api/health']);

export function requestId(req, res, next) {
  // Honour an upstream id if a proxy already assigned one, so a request can be
  // traced across services rather than renamed at each hop.
  req.id = req.get('x-request-id') ?? randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

export function requestLogger(req, res, next) {
  if (config.isTest) return next();

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    if (QUIET_PATHS.has(req.path) && res.statusCode < 400) return;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    const entry = {
      time: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      // Useful for spotting one account hammering an endpoint. Never the body:
      // that would put passwords in the log.
      userId: req.user?.id,
    };

    if (config.isProduction) {
      console.log(JSON.stringify(entry));
      return;
    }

    console.log(
      `${entry.method} ${entry.path} ${entry.status} ${entry.durationMs}ms`,
    );
  });

  next();
}
