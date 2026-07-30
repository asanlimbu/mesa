/**
 * Restaurant discovery and ownership.
 *
 * The availability filter is what makes search meaningful: it composes the pure
 * booking engine into the query so results reflect real bookable capacity, not
 * a static directory listing.
 */

import { prisma } from '../db.js';
import { notFound, badRequest } from '../lib/errors.js';
import { BLOCKING_STATUSES } from '../lib/constants.js';
import { parseDateTime } from '../lib/validation.js';
import {
  endOfSitting,
  allocateTable,
  isWithinOpeningHours,
  hoursForDate,
  candidateSittings,
} from '../lib/availability.js';

const CARD_FIELDS = {
  id: true,
  name: true,
  slug: true,
  description: true,
  cuisine: true,
  city: true,
  addressLine: true,
  postcode: true,
  priceBand: true,
  rating: true,
  heroImage: true,
  seatingMinutes: true,
  openingHours: true,
};

/** Opening hours live as a JSON string; never let a bad row crash a listing. */
export function parseOpeningHours(raw) {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function present(restaurant) {
  return { ...restaurant, openingHours: parseOpeningHours(restaurant.openingHours) };
}

/**
 * Search, filter, sort and paginate restaurants.
 *
 * Text, cuisine, city and price filters run in the database. The availability
 * filter runs in application code, because it needs the pure engine's
 * table-allocation rules rather than something expressible in SQL.
 */
export async function search(params) {
  const { q, cuisines, city, priceBands, sort, page, pageSize, partySize } = params;

  const where = {
    ...(city ? { city } : {}),
    ...(cuisines.length > 0 ? { cuisine: { in: cuisines } } : {}),
    ...(priceBands.length > 0 ? { priceBand: { in: priceBands } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { description: { contains: q } },
            { cuisine: { contains: q } },
          ],
        }
      : {}),
  };

  const orderBy = {
    name: { name: 'asc' },
    price_asc: { priceBand: 'asc' },
    price_desc: { priceBand: 'desc' },
    rating: { rating: 'desc' },
  }[sort] ?? { rating: 'desc' };

  const wantsAvailability = Boolean(params.date && params.time && partySize);

  // Without an availability filter the database can paginate directly.
  if (!wantsAvailability) {
    const [rows, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        orderBy,
        select: CARD_FIELDS,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.restaurant.count({ where }),
    ]);

    return {
      restaurants: rows.map(present),
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize) || 1,
    };
  }

  // With one, every match must be checked before paginating, so the page
  // numbers reflect only genuinely bookable venues.
  const startsAt = parseDateTime({ date: params.date, time: params.time });
  if (!startsAt) throw badRequest('Invalid date or time.');

  const matches = await prisma.restaurant.findMany({
    where,
    orderBy,
    select: { ...CARD_FIELDS, tables: { select: { id: true, label: true, seats: true } } },
  });

  const available = [];
  for (const restaurant of matches) {
    const window = {
      startsAt,
      endsAt: endOfSitting(startsAt, restaurant.seatingMinutes),
    };
    const openingHours = parseOpeningHours(restaurant.openingHours);

    if (!isWithinOpeningHours(window, openingHours).ok) continue;

    const reservations = await prisma.reservation.findMany({
      where: {
        restaurantId: restaurant.id,
        status: { in: [...BLOCKING_STATUSES] },
        startsAt: { lt: window.endsAt },
        endsAt: { gt: window.startsAt },
      },
      select: { id: true, tableId: true, startsAt: true, endsAt: true, status: true },
    });

    if (allocateTable(restaurant.tables, partySize, window, reservations)) {
      const { tables, ...card } = restaurant;
      available.push(present(card));
    }
  }

  const total = available.length;
  return {
    restaurants: available.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize) || 1,
  };
}

export async function getBySlugOrId(identifier) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { OR: [{ slug: identifier }, { id: identifier }] },
    select: {
      ...CARD_FIELDS,
      managerId: true,
      tables: { select: { id: true, label: true, seats: true }, orderBy: { seats: 'asc' } },
    },
  });

  if (!restaurant) throw notFound('That restaurant does not exist.');
  return present(restaurant);
}

/**
 * Which sittings on a given day could seat this party.
 *
 * Returns every candidate time with a free/taken flag, so the UI can show the
 * whole service and grey out what is gone rather than hiding it.
 */
export async function availabilityFor({ identifier, dateString, partySize }) {
  const restaurant = await getBySlugOrId(identifier);

  const day = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(day.getTime())) throw badRequest('Invalid date.');

  const hours = hoursForDate(day, restaurant.openingHours);
  if (!hours) {
    return { date: dateString, closed: true, slots: [] };
  }

  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600_000);

  const reservations = await prisma.reservation.findMany({
    where: {
      restaurantId: restaurant.id,
      status: { in: [...BLOCKING_STATUSES] },
      startsAt: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true, tableId: true, startsAt: true, endsAt: true, status: true },
  });

  const slots = candidateSittings(day, hours, restaurant.seatingMinutes).map(
    (startsAt) => {
      const window = {
        startsAt,
        endsAt: endOfSitting(startsAt, restaurant.seatingMinutes),
      };
      const table = allocateTable(restaurant.tables, partySize, window, reservations);
      return {
        startsAt: startsAt.toISOString(),
        available: table !== null,
        seats: table?.seats ?? null,
      };
    },
  );

  return { date: dateString, closed: false, partySize, slots };
}

/**
 * The restaurant a manager owns.
 *
 * A manager without a restaurant is a legitimate state — they registered but
 * have not been set up — so this returns null rather than throwing.
 */
export async function restaurantForManager(managerId) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { managerId },
    select: {
      ...CARD_FIELDS,
      managerId: true,
      tables: { select: { id: true, label: true, seats: true }, orderBy: { seats: 'asc' } },
    },
  });

  return restaurant ? present(restaurant) : null;
}

/**
 * Ownership gate for manager routes.
 *
 * Returns 404 rather than 403 on a foreign restaurant: a 403 would confirm the
 * record exists, which leaks the platform's contents to a probing manager.
 */
export async function assertOwnsRestaurant(restaurantId, managerId) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, managerId: true, seatingMinutes: true, openingHours: true },
  });

  if (!restaurant || restaurant.managerId !== managerId) {
    throw notFound('That restaurant does not exist.');
  }

  return present(restaurant);
}

export async function listCuisinesAndCities() {
  const rows = await prisma.restaurant.findMany({
    select: { cuisine: true, city: true },
  });

  return {
    cuisines: [...new Set(rows.map((r) => r.cuisine))].sort(),
    cities: [...new Set(rows.map((r) => r.city))].sort(),
  };
}
