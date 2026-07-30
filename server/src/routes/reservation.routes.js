import { Router } from 'express';

import * as reservationService from '../services/reservation.service.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { badRequest } from '../lib/errors.js';
import { parseDateTime } from '../lib/validation.js';

export const reservationRoutes = Router();

// Everything below requires a signed-in user.
reservationRoutes.use(authenticate);

reservationRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const { restaurantId, startsAt, date, time, partySize, notes } = req.body ?? {};

    if (!restaurantId) throw badRequest('A restaurant is required.');

    const when = parseDateTime({ isoString: startsAt, date, time });
    if (!when) throw badRequest('A valid date and time is required.');

    const reservation = await reservationService.create({
      userId: req.user.id,
      restaurantId,
      startsAt: when,
      partySize: Number(partySize),
      notes,
    });

    res.status(201).json(reservation);
  }),
);

/** The signed-in diner's own bookings. */
reservationRoutes.get(
  '/mine',
  asyncHandler(async (req, res) => {
    res.json(await reservationService.listForUser(req.user.id));
  }),
);

reservationRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await reservationService.getForUser(req.params.id, req.user));
  }),
);

reservationRoutes.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { startsAt, date, time, partySize, notes } = req.body ?? {};

    const when =
      startsAt || (date && time) ? parseDateTime({ isoString: startsAt, date, time }) : null;

    if ((startsAt || (date && time)) && !when) {
      throw badRequest('That is not a valid date and time.');
    }

    res.json(
      await reservationService.update({
        reservationId: req.params.id,
        user: req.user,
        startsAt: when ?? undefined,
        partySize: partySize !== undefined ? Number(partySize) : undefined,
        notes,
      }),
    );
  }),
);

reservationRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await reservationService.cancel({
        reservationId: req.params.id,
        user: req.user,
      }),
    );
  }),
);
