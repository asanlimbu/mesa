import { Router } from 'express';

import * as restaurantService from '../services/restaurant.service.js';
import { asyncHandler } from '../middleware/error.js';
import { parseRestaurantQuery } from '../lib/validation.js';
import { badRequest } from '../lib/errors.js';

export const restaurantRoutes = Router();

/** Public discovery: search, filter, sort, paginate. */
restaurantRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = parseRestaurantQuery(req.query);
    res.json(await restaurantService.search(params));
  }),
);

/** Filter options for the search UI, derived from live data. */
restaurantRoutes.get(
  '/filters',
  asyncHandler(async (_req, res) => {
    res.json(await restaurantService.listCuisinesAndCities());
  }),
);

restaurantRoutes.get(
  '/:identifier',
  asyncHandler(async (req, res) => {
    res.json(await restaurantService.getBySlugOrId(req.params.identifier));
  }),
);

/** Every sitting on a day, flagged free or taken. */
restaurantRoutes.get(
  '/:identifier/availability',
  asyncHandler(async (req, res) => {
    const { date, partySize } = req.query;

    if (!date) throw badRequest('A date is required.');

    const size = Number(partySize ?? 2);
    if (!Number.isInteger(size) || size < 1) {
      throw badRequest('Party size must be a whole number of at least 1.');
    }

    res.json(
      await restaurantService.availabilityFor({
        identifier: req.params.identifier,
        dateString: date,
        partySize: size,
      }),
    );
  }),
);
