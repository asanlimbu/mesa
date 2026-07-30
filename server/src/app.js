/**
 * Express application.
 *
 * Exported without calling listen() so tests can mount it with Supertest
 * without binding a port.
 */

import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import { authRoutes } from './routes/auth.routes.js';
import { restaurantRoutes } from './routes/restaurant.routes.js';
import { reservationRoutes } from './routes/reservation.routes.js';
import { managerRoutes } from './routes/manager.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', environment: config.nodeEnv });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/restaurants', restaurantRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/manager', managerRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
