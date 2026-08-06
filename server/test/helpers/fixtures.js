/**
 * Test fixtures.
 *
 * Builds a small, known restaurant estate directly through Prisma rather than
 * running the demo seed: integration tests need data they can reason about
 * exactly — two venues under different managers, a handful of tables with known
 * sizes — not four thousand plausible bookings.
 *
 * Every test run starts from an empty database, so tests cannot leak into one
 * another and there is no ordering dependency between them.
 */

import bcrypt from 'bcryptjs';

import { prisma } from '../../src/db.js';
import { ROLES } from '../../src/lib/constants.js';

export const PASSWORD = 'password123';

/** Open every day, midday to 22:30, so a sitting is always findable. */
const ALWAYS_OPEN = {
  sun: { open: '12:00', close: '22:30' },
  mon: { open: '12:00', close: '22:30' },
  tue: { open: '12:00', close: '22:30' },
  wed: { open: '12:00', close: '22:30' },
  thu: { open: '12:00', close: '22:30' },
  fri: { open: '12:00', close: '22:30' },
  sat: { open: '12:00', close: '22:30' },
};

/** Wipe in dependency order — reservations hold the foreign keys. */
export async function resetDatabase() {
  await prisma.reservation.deleteMany();
  await prisma.table.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Two venues, two managers, one diner.
 *
 * The second venue exists solely so the authorisation tests have somewhere a
 * manager is *not* allowed to look.
 */
export async function seedFixtures() {
  const passwordHash = await bcrypt.hash(PASSWORD, 4); // low cost: tests, not production

  const [managerOne, managerTwo, diner, otherDiner] = await Promise.all([
    prisma.user.create({
      data: { name: 'Manager One', email: 'one@test.local', passwordHash, role: ROLES.MANAGER },
    }),
    prisma.user.create({
      data: { name: 'Manager Two', email: 'two@test.local', passwordHash, role: ROLES.MANAGER },
    }),
    prisma.user.create({
      data: { name: 'Test Diner', email: 'diner@test.local', passwordHash, role: ROLES.DINER },
    }),
    prisma.user.create({
      data: { name: 'Other Diner', email: 'other@test.local', passwordHash, role: ROLES.DINER },
    }),
  ]);

  const alpha = await prisma.restaurant.create({
    data: {
      name: 'Alpha',
      slug: 'alpha',
      description: 'The venue under test.',
      cuisine: 'British',
      city: 'London',
      addressLine: '1 Test Street',
      postcode: 'E1 1AA',
      priceBand: 2,
      rating: 4.5,
      heroImage: 'https://example.test/alpha.jpg',
      seatingMinutes: 90,
      openingHours: JSON.stringify(ALWAYS_OPEN),
      managerId: managerOne.id,
      // Exactly one table of each size, so allocation is unambiguous.
      tables: {
        create: [
          { label: 'A2', seats: 2 },
          { label: 'A4', seats: 4 },
          { label: 'A6', seats: 6 },
        ],
      },
    },
    include: { tables: true },
  });

  const beta = await prisma.restaurant.create({
    data: {
      name: 'Beta',
      slug: 'beta',
      description: 'The venue the other manager owns.',
      cuisine: 'Japanese',
      city: 'Manchester',
      addressLine: '2 Test Street',
      postcode: 'M1 1AA',
      priceBand: 4,
      rating: 4.8,
      heroImage: 'https://example.test/beta.jpg',
      seatingMinutes: 90,
      openingHours: JSON.stringify(ALWAYS_OPEN),
      managerId: managerTwo.id,
      tables: { create: [{ label: 'B2', seats: 2 }] },
    },
    include: { tables: true },
  });

  return { managerOne, managerTwo, diner, otherDiner, alpha, beta };
}

/**
 * A bookable slot, comfortably in the future and inside opening hours.
 *
 * Tests must never depend on the wall clock: "19:00 today" is in the past by
 * the evening, and a suite that passes in the morning and fails after dinner
 * is worse than no suite.
 */
export function futureSitting(daysAhead = 3, hour = 19) {
  const when = new Date();
  when.setDate(when.getDate() + daysAhead);
  when.setHours(hour, 0, 0, 0);
  return when;
}

export const isoOf = (date) => date.toISOString();
