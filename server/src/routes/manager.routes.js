/**
 * Manager-only routes.
 *
 * Two gates apply to everything here: `authorize(MANAGER)` checks the role, and
 * each service call additionally verifies the venue belongs to this manager.
 * The role check alone would let any manager read every other venue's bookings.
 */

import { Router } from 'express';

import * as restaurantService from '../services/restaurant.service.js';
import * as reservationService from '../services/reservation.service.js';
import * as statsService from '../services/stats.service.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { ROLES } from '../lib/constants.js';
import { badRequest, notFound } from '../lib/errors.js';

export const managerRoutes = Router();

managerRoutes.use(authenticate, authorize(ROLES.MANAGER));

/** The venue this manager owns. */
managerRoutes.get(
  '/restaurant',
  asyncHandler(async (req, res) => {
    const restaurant = await restaurantService.restaurantForManager(req.user.id);
    if (!restaurant) {
      throw notFound('You do not have a restaurant set up yet.');
    }
    res.json(restaurant);
  }),
);

/** Reservation queue, optionally filtered by date range and status. */
managerRoutes.get(
  '/reservations',
  asyncHandler(async (req, res) => {
    const restaurant = await restaurantService.restaurantForManager(req.user.id);
    if (!restaurant) throw notFound('You do not have a restaurant set up yet.');

    const { from, to, status } = req.query;

    const parseBoundary = (value, label) => {
      if (!value) return undefined;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) throw badRequest(`Invalid ${label} date.`);
      return parsed;
    };

    res.json(
      await reservationService.listForRestaurant({
        restaurantId: restaurant.id,
        managerId: req.user.id,
        from: parseBoundary(from, 'from'),
        to: parseBoundary(to, 'to'),
        status: typeof status === 'string' && status ? status : undefined,
      }),
    );
  }),
);

/** Move a booking through the service lifecycle. */
managerRoutes.patch(
  '/reservations/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body ?? {};
    if (!status) throw badRequest('A status is required.');

    res.json(
      await reservationService.setStatus({
        reservationId: req.params.id,
        managerId: req.user.id,
        status,
      }),
    );
  }),
);

/** Dashboard metrics. */
managerRoutes.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const restaurant = await restaurantService.restaurantForManager(req.user.id);
    if (!restaurant) throw notFound('You do not have a restaurant set up yet.');

    const daysRaw = Number(req.query.days ?? 30);
    const days = Number.isInteger(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;

    res.json(
      await statsService.dashboard({
        restaurantId: restaurant.id,
        managerId: req.user.id,
        days,
      }),
    );
  }),
);
