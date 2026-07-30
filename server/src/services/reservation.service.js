/**
 * Creating, modifying and cancelling reservations.
 *
 * Every write runs inside a transaction that re-reads conflicting bookings
 * immediately before insert. Checking availability and then inserting as two
 * separate statements leaves a window in which two diners both see the last
 * table free and both book it.
 */

import { prisma } from '../db.js';
import {
  RESERVATION_STATUS,
  BLOCKING_STATUSES,
  MANAGER_SETTABLE_STATUSES,
  CANCELLATION_WINDOW_MINUTES,
} from '../lib/constants.js';
import { notFound, badRequest, conflict, forbidden } from '../lib/errors.js';
import { evaluateBooking, endOfSitting } from '../lib/availability.js';
import { parseOpeningHours, assertOwnsRestaurant } from './restaurant.service.js';

const DETAIL_INCLUDE = {
  restaurant: {
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      addressLine: true,
      postcode: true,
      cuisine: true,
      heroImage: true,
      seatingMinutes: true,
    },
  },
  table: { select: { id: true, label: true, seats: true } },
  user: { select: { id: true, name: true, email: true } },
};

/** Translate an engine rejection into the right HTTP response. */
function rejectionToError(result) {
  switch (result.reason) {
    case 'TABLE_UNAVAILABLE':
      return conflict(
        'TABLE_UNAVAILABLE',
        'No table is free at that time.',
        {
          alternatives: (result.alternatives ?? []).map((d) => d.toISOString()),
        },
      );
    case 'PARTY_TOO_LARGE':
      return badRequest('This restaurant has no table large enough for that party.');
    case 'CLOSED_THAT_DAY':
      return badRequest('The restaurant is closed that day.');
    case 'BEFORE_OPENING':
      return badRequest('That is before the restaurant opens.');
    case 'AFTER_CLOSING':
      return badRequest('The sitting would run past closing time.');
    case 'IN_THE_PAST':
      return badRequest('That time has already passed.');
    case 'PARTY_SIZE_OUT_OF_RANGE':
    case 'PARTY_SIZE_NOT_INTEGER':
      return badRequest('Party size must be a whole number between 1 and 20.');
    case 'INVALID_DATE':
      return badRequest('That is not a valid date and time.');
    default:
      return badRequest('That booking cannot be made.');
  }
}

/**
 * Reservations that could clash with a window, loaded inside the transaction.
 */
function loadClashing(tx, restaurantId, window) {
  return tx.reservation.findMany({
    where: {
      restaurantId,
      status: { in: [...BLOCKING_STATUSES] },
      startsAt: { lt: window.endsAt },
      endsAt: { gt: window.startsAt },
    },
    select: { id: true, tableId: true, startsAt: true, endsAt: true, status: true },
  });
}

export async function create({ userId, restaurantId, startsAt, partySize, notes }) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      seatingMinutes: true,
      openingHours: true,
      tables: { select: { id: true, label: true, seats: true } },
    },
  });

  if (!restaurant) throw notFound('That restaurant does not exist.');

  const openingHours = parseOpeningHours(restaurant.openingHours);

  return prisma.$transaction(async (tx) => {
    const window = {
      startsAt,
      endsAt: endOfSitting(startsAt, restaurant.seatingMinutes),
    };

    const reservations = await loadClashing(tx, restaurant.id, window);

    const result = evaluateBooking({
      startsAt,
      partySize,
      tables: restaurant.tables,
      reservations,
      openingHours,
      seatingMinutes: restaurant.seatingMinutes,
      now: new Date(),
    });

    if (!result.ok) throw rejectionToError(result);

    return tx.reservation.create({
      data: {
        restaurantId: restaurant.id,
        tableId: result.table.id,
        userId,
        partySize,
        startsAt: result.window.startsAt,
        endsAt: result.window.endsAt,
        status: RESERVATION_STATUS.CONFIRMED,
        notes: notes?.trim() || null,
      },
      include: DETAIL_INCLUDE,
    });
  });
}

/** A diner's own reservations, split into upcoming and past. */
export async function listForUser(userId) {
  const reservations = await prisma.reservation.findMany({
    where: { userId },
    include: DETAIL_INCLUDE,
    orderBy: { startsAt: 'desc' },
  });

  const now = new Date();
  const isUpcoming = (r) =>
    r.startsAt >= now &&
    r.status !== RESERVATION_STATUS.CANCELLED &&
    r.status !== RESERVATION_STATUS.NO_SHOW;

  return {
    upcoming: reservations.filter(isUpcoming).sort((a, b) => a.startsAt - b.startsAt),
    past: reservations.filter((r) => !isUpcoming(r)),
  };
}

/** A single reservation, readable by the diner who holds it or the venue's manager. */
export async function getForUser(reservationId, user) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { ...DETAIL_INCLUDE, restaurant: { select: { ...DETAIL_INCLUDE.restaurant.select, managerId: true } } },
  });

  if (!reservation) throw notFound('That reservation does not exist.');

  const isOwner = reservation.userId === user.id;
  const isVenueManager = reservation.restaurant.managerId === user.id;

  // 404, not 403 — do not confirm the reservation exists to someone unrelated.
  if (!isOwner && !isVenueManager) throw notFound('That reservation does not exist.');

  return reservation;
}

/**
 * Change the time or party size of an existing booking.
 *
 * Re-runs the engine and may reallocate the table — a party growing from two to
 * six cannot stay at the two-top.
 */
export async function update({ reservationId, user, startsAt, partySize, notes }) {
  const existing = await getForUser(reservationId, user);

  if (existing.userId !== user.id) {
    throw forbidden('Only the diner who made the booking can change it.');
  }

  if (
    existing.status === RESERVATION_STATUS.CANCELLED ||
    existing.status === RESERVATION_STATUS.NO_SHOW
  ) {
    throw badRequest('That booking can no longer be changed.');
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: existing.restaurantId },
    select: {
      id: true,
      seatingMinutes: true,
      openingHours: true,
      tables: { select: { id: true, label: true, seats: true } },
    },
  });

  const nextStartsAt = startsAt ?? existing.startsAt;
  const nextPartySize = partySize ?? existing.partySize;

  return prisma.$transaction(async (tx) => {
    const window = {
      startsAt: nextStartsAt,
      endsAt: endOfSitting(nextStartsAt, restaurant.seatingMinutes),
    };

    const reservations = await loadClashing(tx, restaurant.id, window);

    const result = evaluateBooking({
      startsAt: nextStartsAt,
      partySize: nextPartySize,
      tables: restaurant.tables,
      reservations,
      openingHours: parseOpeningHours(restaurant.openingHours),
      seatingMinutes: restaurant.seatingMinutes,
      now: new Date(),
      ignoreReservationId: existing.id,
    });

    if (!result.ok) throw rejectionToError(result);

    return tx.reservation.update({
      where: { id: existing.id },
      data: {
        tableId: result.table.id,
        partySize: nextPartySize,
        startsAt: result.window.startsAt,
        endsAt: result.window.endsAt,
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
      include: DETAIL_INCLUDE,
    });
  });
}

export async function cancel({ reservationId, user }) {
  const existing = await getForUser(reservationId, user);

  if (existing.userId !== user.id) {
    throw forbidden('Only the diner who made the booking can cancel it.');
  }

  if (existing.status === RESERVATION_STATUS.CANCELLED) {
    return existing;
  }

  const minutesUntil = (existing.startsAt - new Date()) / 60_000;
  if (minutesUntil < CANCELLATION_WINDOW_MINUTES) {
    throw badRequest(
      `Bookings can only be cancelled more than ${CANCELLATION_WINDOW_MINUTES / 60} hours ahead. Please call the restaurant.`,
    );
  }

  return prisma.reservation.update({
    where: { id: existing.id },
    data: { status: RESERVATION_STATUS.CANCELLED },
    include: DETAIL_INCLUDE,
  });
}

/** The venue's reservation queue, for the manager who owns it. */
export async function listForRestaurant({ restaurantId, managerId, from, to, status }) {
  await assertOwnsRestaurant(restaurantId, managerId);

  return prisma.reservation.findMany({
    where: {
      restaurantId,
      ...(status ? { status } : {}),
      ...(from || to
        ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    include: DETAIL_INCLUDE,
    orderBy: { startsAt: 'asc' },
  });
}

/** Manager moves a booking through the service lifecycle. */
export async function setStatus({ reservationId, managerId, status }) {
  if (!MANAGER_SETTABLE_STATUSES.includes(status)) {
    throw badRequest('That is not a status a manager can set.');
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, restaurantId: true },
  });

  if (!reservation) throw notFound('That reservation does not exist.');

  // Ownership gate — throws 404 when the venue is not this manager's.
  await assertOwnsRestaurant(reservation.restaurantId, managerId);

  return prisma.reservation.update({
    where: { id: reservation.id },
    data: { status },
    include: DETAIL_INCLUDE,
  });
}
