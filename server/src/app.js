/**
 * Express application.
 *
 * Exported without calling listen() so tests can mount it with Supertest
 * without binding a port.
 *
 * Middleware order matters and is deliberate:
 *   1. request id      — so everything after it can be correlated
 *   2. security headers
 *   3. CORS
 *   4. rate limiting   — before the body is parsed, so a flood costs nothing
 *   5. body parsing
 *   6. logging         — after the id exists, before the routes it reports on
 *   7. routes
 *   8. 404, then the error handler, which must be last
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { config } from './config.js';
import { prisma } from './db.js';
import { authRoutes } from './routes/auth.routes.js';
import { restaurantRoutes } from './routes/restaurant.routes.js';
import { reservationRoutes } from './routes/reservation.routes.js';
import { managerRoutes } from './routes/manager.routes.js';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/error.js';
import { requestId, requestLogger } from './middleware/logging.js';
import { authLimiter, writeLimiter, generalLimiter } from './middleware/security.js';

export function createApp() {
  const app = express();

  // Behind a proxy (any real deployment), the client IP arrives in
  // X-Forwarded-For. Without this the rate limiter would see one IP — the
  // proxy's — and throttle every user as if they were the same person.
  if (config.isProduction) app.set('trust proxy', 1);

  // Express advertises itself by default; there is no reason to tell an
  // attacker which server and version they are talking to.
  app.disable('x-powered-by');

  app.use(requestId);

  app.use(
    helmet({
      // This API serves JSON to a separate origin, never HTML, so the CSP that
      // would protect a rendered page has nothing to protect here.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  app.use(generalLimiter);
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  /**
   * Health check.
   *
   * Reports unhealthy if the database is unreachable. A check that only proves
   * the process is alive tells a load balancer nothing — it would keep routing
   * traffic to an instance that cannot serve a single request.
   */
  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const startedAt = Date.now();

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        return res.status(503).json({
          status: 'unhealthy',
          database: 'unreachable',
          environment: config.nodeEnv,
        });
      }

      return res.json({
        status: 'ok',
        environment: config.nodeEnv,
        uptimeSeconds: Math.round(process.uptime()),
        database: { status: 'ok', latencyMs: Date.now() - startedAt },
      });
    }),
  );

  // Credential endpoints carry their own tighter limit.
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/restaurants', restaurantRoutes);
  app.use('/api/reservations', writeLimiter, reservationRoutes);
  app.use('/api/manager', managerRoutes);

  /**
   * Serve the built React front end from the same Node server.
   *
   * In development the two run separately — Vite owns the client and proxies
   * /api here — because hot reload is worth more than a single origin. Once
   * built, one process serves both, which is what a deployment actually looks
   * like and removes CORS from the picture entirely.
   *
   * Mounted after the API routes so nothing here can shadow an endpoint, and
   * before the 404 handler so unknown *page* routes still reach React Router.
   */
  const clientBuild = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

  if (existsSync(join(clientBuild, 'index.html'))) {
    // Hashed asset filenames are safe to cache hard; index.html never is, or
    // visitors keep loading the previous build's script tags.
    app.use(
      express.static(clientBuild, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );

    // Client-side routing: any non-API path that is not a real file is a React
    // route, so hand it index.html and let the router decide — including /404.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      // sendFile bypasses the static handler above, so the shell sets its own
      // no-cache header — otherwise a cached index.html keeps pointing at the
      // previous build's hashed bundles after a deploy.
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(clientBuild, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
