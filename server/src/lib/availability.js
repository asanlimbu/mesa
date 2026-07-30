/**
 * Booking availability engine.
 *
 * Deliberately pure: no database, no Express, no `new Date()` without an
 * explicit argument. Every function takes plain objects and returns plain
 * values, so the whole engine is unit-testable in isolation and the same
 * functions can run inside a transaction or against in-memory fixtures.
 *
 * Time windows are half-open: [startsAt, endsAt). A table freed at 20:00 can be
 * rebooked at 20:00 exactly, which is what a restaurant expects.
 */

import {
  BLOCKING_STATUSES,
  WEEKDAYS,
  PARTY_SIZE_MIN,
  PARTY_SIZE_MAX,
} from './constants.js';

/**
 * Do two half-open time windows overlap?
 *
 * @param {{ startsAt: Date, endsAt: Date }} a
 * @param {{ startsAt: Date, endsAt: Date }} b
 * @returns {boolean}
 */
export function overlaps(a, b) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

/**
 * Does a reservation still hold its table?
 *
 * Cancelled, completed and no-show reservations have released their table and
 * must never block a new booking.
 *
 * @param {{ status: string }} reservation
 * @returns {boolean}
 */
export function isBlocking(reservation) {
  return BLOCKING_STATUSES.includes(reservation.status);
}

/**
 * Compute the end of a sitting.
 *
 * @param {Date} startsAt
 * @param {number} seatingMinutes
 * @returns {Date}
 */
export function endOfSitting(startsAt, seatingMinutes) {
  return new Date(startsAt.getTime() + seatingMinutes * 60_000);
}

/**
 * Is a single table free for the requested window?
 *
 * @param {{ id: string }} table
 * @param {{ startsAt: Date, endsAt: Date }} window
 * @param {Array<{ tableId: string, startsAt: Date, endsAt: Date, status: string, id?: string }>} reservations
 * @param {{ ignoreReservationId?: string }} [options] - when modifying a booking,
 *   the booking being modified must not block itself.
 * @returns {boolean}
 */
export function isTableFree(table, window, reservations, options = {}) {
  const { ignoreReservationId } = options;

  return !reservations.some((reservation) => {
    if (reservation.tableId !== table.id) return false;
    if (ignoreReservationId && reservation.id === ignoreReservationId) return false;
    if (!isBlocking(reservation)) return false;
    return overlaps(window, reservation);
  });
}

/**
 * Every table that could seat this party and is free for the window, smallest
 * first.
 *
 * @returns {Array<{ id: string, label: string, seats: number }>}
 */
export function findFreeTables(tables, partySize, window, reservations, options = {}) {
  return tables
    .filter((table) => table.seats >= partySize)
    .filter((table) => isTableFree(table, window, reservations, options))
    .sort((a, b) => a.seats - b.seats || a.label.localeCompare(b.label));
}

/**
 * Pick the table to allocate: the smallest one that fits.
 *
 * Seating a party of two at a six-top burns the scarcest resource in the
 * restaurant, so the smallest sufficient table always wins. Ties break on label
 * so allocation is deterministic and testable.
 *
 * @returns {{ id: string, label: string, seats: number } | null}
 */
export function allocateTable(tables, partySize, window, reservations, options = {}) {
  const free = findFreeTables(tables, partySize, window, reservations, options);
  return free.length > 0 ? free[0] : null;
}

/**
 * Parse "HH:MM" into minutes from midnight.
 *
 * @param {string} value
 * @returns {number|null} null when the string is not a valid time
 */
export function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The opening hours entry for the weekday a date falls on.
 *
 * @param {Date} date
 * @param {Record<string, { open: string, close: string }|null>} openingHours
 * @returns {{ open: string, close: string }|null} null when closed that day
 */
export function hoursForDate(date, openingHours) {
  const key = WEEKDAYS[date.getDay()];
  return openingHours?.[key] ?? null;
}

/**
 * Does the whole sitting fall inside the restaurant's opening hours?
 *
 * The sitting must both start and finish within the window — a booking that
 * starts ten minutes before closing is not a real booking.
 *
 * A close time earlier than the open time means the kitchen runs past midnight
 * (e.g. 18:00–01:00), so the closing boundary moves to the following day.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function isWithinOpeningHours(window, openingHours) {
  const hours = hoursForDate(window.startsAt, openingHours);
  if (!hours) {
    return { ok: false, reason: 'CLOSED_THAT_DAY' };
  }

  const open = parseTimeToMinutes(hours.open);
  const close = parseTimeToMinutes(hours.close);
  if (open === null || close === null) {
    return { ok: false, reason: 'INVALID_OPENING_HOURS' };
  }

  const dayStart = new Date(window.startsAt);
  dayStart.setHours(0, 0, 0, 0);

  const opensAt = new Date(dayStart.getTime() + open * 60_000);
  const closesAt = new Date(
    dayStart.getTime() + (close <= open ? close + 24 * 60 : close) * 60_000,
  );

  if (window.startsAt < opensAt) return { ok: false, reason: 'BEFORE_OPENING' };
  if (window.endsAt > closesAt) return { ok: false, reason: 'AFTER_CLOSING' };

  return { ok: true };
}

/**
 * Validate a requested party size.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function isValidPartySize(partySize) {
  if (!Number.isInteger(partySize)) {
    return { ok: false, reason: 'PARTY_SIZE_NOT_INTEGER' };
  }
  if (partySize < PARTY_SIZE_MIN || partySize > PARTY_SIZE_MAX) {
    return { ok: false, reason: 'PARTY_SIZE_OUT_OF_RANGE' };
  }
  return { ok: true };
}

/**
 * Candidate sitting times across a service, at a fixed interval.
 *
 * Used both to render the time picker and to suggest alternatives when the
 * requested slot is taken.
 *
 * @param {Date} date - any instant on the target day
 * @param {{ open: string, close: string }} hours
 * @param {number} seatingMinutes
 * @param {number} [intervalMinutes=30]
 * @returns {Date[]}
 */
export function candidateSittings(date, hours, seatingMinutes, intervalMinutes = 30) {
  const open = parseTimeToMinutes(hours.open);
  const close = parseTimeToMinutes(hours.close);
  if (open === null || close === null) return [];

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const closeMinutes = close <= open ? close + 24 * 60 : close;
  const lastStart = closeMinutes - seatingMinutes;

  const sittings = [];
  for (let minutes = open; minutes <= lastStart; minutes += intervalMinutes) {
    sittings.push(new Date(dayStart.getTime() + minutes * 60_000));
  }
  return sittings;
}

/**
 * Times near a requested slot that could actually be booked.
 *
 * Returned with a 409 so the UI can offer alternatives rather than a dead end.
 *
 * @returns {Date[]} up to `limit` times, closest to the request first
 */
export function suggestAlternatives({
  requestedAt,
  partySize,
  tables,
  reservations,
  openingHours,
  seatingMinutes,
  limit = 3,
}) {
  const hours = hoursForDate(requestedAt, openingHours);
  if (!hours) return [];

  return candidateSittings(requestedAt, hours, seatingMinutes)
    .filter((startsAt) => startsAt.getTime() !== requestedAt.getTime())
    .map((startsAt) => ({
      startsAt,
      window: { startsAt, endsAt: endOfSitting(startsAt, seatingMinutes) },
    }))
    .filter(({ window }) =>
      allocateTable(tables, partySize, window, reservations) !== null,
    )
    .sort(
      (a, b) =>
        Math.abs(a.startsAt - requestedAt) - Math.abs(b.startsAt - requestedAt),
    )
    .slice(0, limit)
    .map(({ startsAt }) => startsAt);
}

/**
 * Full check for a booking request, composing the rules above.
 *
 * @returns {{ ok: true, table: object, window: object }
 *          | { ok: false, reason: string, alternatives?: Date[] }}
 */
export function evaluateBooking({
  startsAt,
  partySize,
  tables,
  reservations,
  openingHours,
  seatingMinutes,
  now,
  ignoreReservationId,
}) {
  const partyCheck = isValidPartySize(partySize);
  if (!partyCheck.ok) return { ok: false, reason: partyCheck.reason };

  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    return { ok: false, reason: 'INVALID_DATE' };
  }

  if (now && startsAt <= now) {
    return { ok: false, reason: 'IN_THE_PAST' };
  }

  const window = { startsAt, endsAt: endOfSitting(startsAt, seatingMinutes) };

  const hoursCheck = isWithinOpeningHours(window, openingHours);
  if (!hoursCheck.ok) return { ok: false, reason: hoursCheck.reason };

  // A party nobody could ever seat is a different error from a party nobody can
  // seat *right now* — the first is permanent, the second suggests other times.
  const fitsAnyTable = tables.some((table) => table.seats >= partySize);
  if (!fitsAnyTable) {
    return { ok: false, reason: 'PARTY_TOO_LARGE' };
  }

  const table = allocateTable(tables, partySize, window, reservations, {
    ignoreReservationId,
  });

  if (!table) {
    return {
      ok: false,
      reason: 'TABLE_UNAVAILABLE',
      alternatives: suggestAlternatives({
        requestedAt: startsAt,
        partySize,
        tables,
        reservations,
        openingHours,
        seatingMinutes,
      }),
    };
  }

  return { ok: true, table, window };
}
