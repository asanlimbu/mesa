/**
 * Dashboard metrics for a manager's own restaurant.
 *
 * Aggregation happens on the server so the client receives display-ready
 * numbers rather than a reservation dump it has to reduce itself.
 */

import { prisma } from '../db.js';
import { RESERVATION_STATUS, BLOCKING_STATUSES } from '../lib/constants.js';
import { assertOwnsRestaurant, parseOpeningHours } from './restaurant.service.js';
import { hoursForDate, parseTimeToMinutes } from '../lib/availability.js';

const DAY_MS = 24 * 3600_000;

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Format a date as YYYY-MM-DD in *local* time.
 *
 * `toISOString()` would convert local midnight to the previous day whenever the
 * server sits east of UTC (British Summer Time is UTC+1), shifting every label
 * on the chart back by one day.
 */
function isoDate(date) {
  const local = startOfDay(date);
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${month}-${day}`;
}

/**
 * Table-hours the restaurant could theoretically sell on a given day, used as
 * the denominator for occupancy.
 */
function capacityMinutesForDay(date, openingHours, tableCount) {
  const hours = hoursForDate(date, openingHours);
  if (!hours) return 0;

  const open = parseTimeToMinutes(hours.open);
  const close = parseTimeToMinutes(hours.close);
  if (open === null || close === null) return 0;

  const span = close <= open ? close + 24 * 60 - open : close - open;
  return span * tableCount;
}

export async function dashboard({ restaurantId, managerId, days = 30 }) {
  const restaurant = await assertOwnsRestaurant(restaurantId, managerId);

  const [venue, tables] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, openingHours: true, seatingMinutes: true },
    }),
    prisma.table.findMany({
      where: { restaurantId },
      select: { id: true, seats: true },
    }),
  ]);

  const openingHours = parseOpeningHours(venue.openingHours);

  const now = new Date();
  const today = startOfDay(now);
  const windowStart = new Date(today.getTime() - (days - 1) * DAY_MS);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  const reservations = await prisma.reservation.findMany({
    where: { restaurantId, startsAt: { gte: windowStart } },
    select: {
      id: true,
      partySize: true,
      startsAt: true,
      endsAt: true,
      status: true,
      tableId: true,
    },
    orderBy: { startsAt: 'asc' },
  });

  const inWindow = reservations.filter((r) => r.startsAt < tomorrow);
  const honoured = inWindow.filter(
    (r) =>
      r.status !== RESERVATION_STATUS.CANCELLED &&
      r.status !== RESERVATION_STATUS.NO_SHOW,
  );

  const todays = reservations.filter(
    (r) => r.startsAt >= today && r.startsAt < tomorrow,
  );
  const todaysHonoured = todays.filter(
    (r) =>
      r.status !== RESERVATION_STATUS.CANCELLED &&
      r.status !== RESERVATION_STATUS.NO_SHOW,
  );

  const upcoming = reservations.filter(
    (r) => r.startsAt >= now && BLOCKING_STATUSES.includes(r.status),
  );

  // Bookings per day across the window, zero-filled so the chart has no gaps.
  const perDay = new Map();
  for (let i = 0; i < days; i += 1) {
    perDay.set(isoDate(new Date(windowStart.getTime() + i * DAY_MS)), {
      date: isoDate(new Date(windowStart.getTime() + i * DAY_MS)),
      bookings: 0,
      covers: 0,
    });
  }
  for (const reservation of honoured) {
    const bucket = perDay.get(isoDate(reservation.startsAt));
    if (bucket) {
      bucket.bookings += 1;
      bucket.covers += reservation.partySize;
    }
  }

  // Covers by hour of day, to show where the pressure sits in a service.
  const byHour = new Map();
  for (const reservation of honoured) {
    const hour = reservation.startsAt.getHours();
    byHour.set(hour, (byHour.get(hour) ?? 0) + reservation.partySize);
  }
  const busiestHours = [...byHour.entries()]
    .map(([hour, covers]) => ({ hour, covers }))
    .sort((a, b) => a.hour - b.hour);

  // Occupancy: minutes sold over minutes available, across the same window.
  let soldMinutes = 0;
  for (const reservation of honoured) {
    soldMinutes += (reservation.endsAt - reservation.startsAt) / 60_000;
  }

  let capacityMinutes = 0;
  for (let i = 0; i < days; i += 1) {
    capacityMinutes += capacityMinutesForDay(
      new Date(windowStart.getTime() + i * DAY_MS),
      openingHours,
      tables.length,
    );
  }

  const occupancyRate =
    capacityMinutes > 0 ? Math.min(1, soldMinutes / capacityMinutes) : 0;

  const cancelled = inWindow.filter(
    (r) => r.status === RESERVATION_STATUS.CANCELLED,
  ).length;
  const noShows = inWindow.filter(
    (r) => r.status === RESERVATION_STATUS.NO_SHOW,
  ).length;

  const rate = (count) => (inWindow.length > 0 ? count / inWindow.length : 0);

  return {
    restaurant: { id: restaurantId, name: venue.name },
    windowDays: days,
    today: {
      bookings: todaysHonoured.length,
      covers: todaysHonoured.reduce((sum, r) => sum + r.partySize, 0),
    },
    upcoming: {
      bookings: upcoming.length,
      covers: upcoming.reduce((sum, r) => sum + r.partySize, 0),
      next: upcoming[0]?.startsAt ?? null,
    },
    totals: {
      bookings: honoured.length,
      covers: honoured.reduce((sum, r) => sum + r.partySize, 0),
      averagePartySize:
        honoured.length > 0
          ? honoured.reduce((sum, r) => sum + r.partySize, 0) / honoured.length
          : 0,
    },
    occupancyRate,
    cancellationRate: rate(cancelled),
    noShowRate: rate(noShows),
    tableCount: tables.length,
    seatCount: tables.reduce((sum, t) => sum + t.seats, 0),
    series: [...perDay.values()],
    busiestHours,
  };
}
