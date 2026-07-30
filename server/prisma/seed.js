/**
 * Seed data.
 *
 * Generates six venues and roughly a month of reservations either side of
 * today, so the manager dashboard has real history to chart and the discovery
 * page has genuine availability gaps rather than everything being free.
 *
 * Bookings are placed through the same conflict-detection engine the API uses,
 * so the seeded data can never contain a double-booking.
 */

import bcrypt from 'bcryptjs';

import { PrismaClient } from '@prisma/client';
import { RESERVATION_STATUS, ROLES } from '../src/lib/constants.js';
import {
  endOfSitting,
  allocateTable,
  candidateSittings,
  hoursForDate,
  parseTimeToMinutes,
} from '../src/lib/availability.js';

const prisma = new PrismaClient();

const STANDARD_HOURS = {
  sun: { open: '12:00', close: '21:00' },
  mon: null,
  tue: { open: '17:00', close: '22:30' },
  wed: { open: '17:00', close: '22:30' },
  thu: { open: '12:00', close: '22:30' },
  fri: { open: '12:00', close: '23:30' },
  sat: { open: '11:00', close: '23:30' },
};

const ALL_WEEK = {
  sun: { open: '10:00', close: '22:00' },
  mon: { open: '08:00', close: '22:00' },
  tue: { open: '08:00', close: '22:00' },
  wed: { open: '08:00', close: '22:00' },
  thu: { open: '08:00', close: '23:00' },
  fri: { open: '08:00', close: '23:59' },
  sat: { open: '09:00', close: '23:59' },
};

const RESTAURANTS = [
  {
    slug: 'the-copper-hearth',
    name: 'The Copper Hearth',
    description:
      'Live-fire British cooking in a converted Victorian foundry. Everything passes over embers before it reaches the pass, and the menu changes with whatever the Kentish growers send that morning.',
    cuisine: 'British',
    city: 'London',
    addressLine: '14 Ironmonger Row, Clerkenwell',
    postcode: 'EC1V 3QN',
    priceBand: 3,
    rating: 4.7,
    heroImage:
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1600&q=80',
    seatingMinutes: 105,
    openingHours: STANDARD_HOURS,
    tables: [
      { label: 'H1', seats: 2 }, { label: 'H2', seats: 2 }, { label: 'H3', seats: 2 },
      { label: 'H4', seats: 4 }, { label: 'H5', seats: 4 }, { label: 'H6', seats: 4 },
      { label: 'H7', seats: 6 }, { label: 'H8', seats: 8 },
    ],
    manager: { name: 'Elena Marchetti', email: 'elena@copperhearth.test' },
  },
  {
    slug: 'sakura-lane',
    name: 'Sakura Lane',
    description:
      'A twelve-seat omakase counter and a small dining room behind it. The counter runs two sittings a night; the room takes bookings up to six.',
    cuisine: 'Japanese',
    city: 'London',
    addressLine: '3 Peter Street, Soho',
    postcode: 'W1F 0AA',
    priceBand: 4,
    rating: 4.9,
    heroImage:
      'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1600&q=80',
    seatingMinutes: 120,
    openingHours: STANDARD_HOURS,
    tables: [
      { label: 'C1', seats: 2 }, { label: 'C2', seats: 2 }, { label: 'C3', seats: 2 },
      { label: 'R1', seats: 4 }, { label: 'R2', seats: 4 }, { label: 'R3', seats: 6 },
    ],
    manager: { name: 'Kenji Watanabe', email: 'kenji@sakuralane.test' },
  },
  {
    slug: 'casa-del-viento',
    name: 'Casa del Viento',
    description:
      'Northern Spanish plates and a sherry list three pages long. Loud, tiled, and cheerfully unbothered about running late on a Friday.',
    cuisine: 'Spanish',
    city: 'Manchester',
    addressLine: '88 Thomas Street, Northern Quarter',
    postcode: 'M4 1EU',
    priceBand: 2,
    rating: 4.5,
    heroImage:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80',
    seatingMinutes: 90,
    openingHours: STANDARD_HOURS,
    tables: [
      { label: 'T1', seats: 2 }, { label: 'T2', seats: 2 }, { label: 'T3', seats: 2 },
      { label: 'T4', seats: 2 }, { label: 'T5', seats: 4 }, { label: 'T6', seats: 4 },
      { label: 'T7', seats: 4 }, { label: 'T8', seats: 6 }, { label: 'T9', seats: 10 },
    ],
    manager: { name: 'Rosa Iglesias', email: 'rosa@casadelviento.test' },
  },
  {
    slug: 'the-brass-monkey',
    name: 'The Brass Monkey',
    description:
      'A corner pub that kept the carpet and replaced the kitchen. Sunday roast until it runs out, which is usually by three.',
    cuisine: 'Gastropub',
    city: 'Bristol',
    addressLine: '2 Jamaica Street, Stokes Croft',
    postcode: 'BS2 8JP',
    priceBand: 2,
    rating: 4.3,
    heroImage:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1600&q=80',
    seatingMinutes: 90,
    openingHours: ALL_WEEK,
    tables: [
      { label: 'B1', seats: 2 }, { label: 'B2', seats: 2 }, { label: 'B3', seats: 4 },
      { label: 'B4', seats: 4 }, { label: 'B5', seats: 4 }, { label: 'B6', seats: 6 },
      { label: 'B7', seats: 6 },
    ],
    manager: { name: 'Dermot Whelan', email: 'dermot@brassmonkey.test' },
  },
  {
    slug: 'amaranth',
    name: 'Amaranth',
    description:
      'Vegetables treated as the main event rather than the garnish. Seven courses, no substitutions, and a wine flight that takes the whole thing seriously.',
    cuisine: 'Vegetarian',
    city: 'Edinburgh',
    addressLine: '41 Thistle Street',
    postcode: 'EH2 1DY',
    priceBand: 4,
    rating: 4.8,
    heroImage:
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1600&q=80',
    seatingMinutes: 150,
    openingHours: STANDARD_HOURS,
    tables: [
      { label: 'A1', seats: 2 }, { label: 'A2', seats: 2 }, { label: 'A3', seats: 4 },
      { label: 'A4', seats: 4 }, { label: 'A5', seats: 6 },
    ],
    manager: { name: 'Fiona Ballantyne', email: 'fiona@amaranth.test' },
  },
  {
    slug: 'gupshup-canteen',
    name: 'Gupshup Canteen',
    description:
      'Railway-station snacks and Gujarati home cooking, served fast on steel trays. Queue at the counter or book the back room for six or more.',
    cuisine: 'Indian',
    city: 'Birmingham',
    addressLine: '19 Ladypool Road, Sparkbrook',
    postcode: 'B12 8JS',
    priceBand: 1,
    rating: 4.6,
    heroImage:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1600&q=80',
    seatingMinutes: 75,
    openingHours: ALL_WEEK,
    tables: [
      { label: 'G1', seats: 2 }, { label: 'G2', seats: 2 }, { label: 'G3', seats: 4 },
      { label: 'G4', seats: 4 }, { label: 'G5', seats: 4 }, { label: 'G6', seats: 6 },
      { label: 'G7', seats: 8 }, { label: 'G8', seats: 8 },
    ],
    manager: { name: 'Priya Raval', email: 'priya@gupshup.test' },
  },
];

/** The account used for the demo, kept to a hand-picked set of bookings. */
const DEMO_DINER = { name: 'Asan Limbu', email: 'asan@example.com' };

/** Background diners, so venues look busy without flooding one account. */
const DINERS = [
  { name: 'Marcus Bell', email: 'marcus@example.com' },
  { name: 'Yasmin Haddad', email: 'yasmin@example.com' },
  { name: 'Tom Okafor', email: 'tom@example.com' },
  { name: 'Grace Lindqvist', email: 'grace@example.com' },
  { name: 'Rafael Costa', email: 'rafael@example.com' },
  { name: 'Nadia Petrov', email: 'nadia@example.com' },
  { name: 'Ollie Truong', email: 'ollie@example.com' },
  { name: 'Hannah Whitfield', email: 'hannah@example.com' },
  { name: 'Sunil Chandra', email: 'sunil@example.com' },
  { name: 'Beatrix Vogel', email: 'beatrix@example.com' },
  { name: 'Callum Fraser', email: 'callum@example.com' },
  { name: 'Imogen Ashby', email: 'imogen@example.com' },
  { name: 'Dmitri Sokolov', email: 'dmitri@example.com' },
  { name: 'Aoife Brennan', email: 'aoife@example.com' },
  { name: 'Joseph Adeyemi', email: 'joseph@example.com' },
  { name: 'Lucia Ferrante', email: 'lucia@example.com' },
];

const PASSWORD = 'password123';

/**
 * Deterministic pseudo-random, so re-seeding produces the same data and the
 * dashboard screenshots in the report stay accurate.
 */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260807);

const pick = (items) => items[Math.floor(random() * items.length)];

const NOTES = [
  null, null, null, null,
  'Window table if possible.',
  'Celebrating a birthday.',
  'One vegetarian in the party.',
  'Wheelchair access needed.',
  'Might be ten minutes late.',
  'Nut allergy — severe.',
];

async function main() {
  console.log('Clearing existing data…');
  await prisma.reservation.deleteMany();
  await prisma.table.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log('Creating diners…');
  const demoDiner = await prisma.user.create({
    data: { ...DEMO_DINER, passwordHash, role: ROLES.DINER },
  });

  const diners = await Promise.all(
    DINERS.map((diner) =>
      prisma.user.create({
        data: { ...diner, passwordHash, role: ROLES.DINER },
      }),
    ),
  );

  console.log('Creating restaurants…');
  const venues = [];

  for (const definition of RESTAURANTS) {
    const manager = await prisma.user.create({
      data: {
        name: definition.manager.name,
        email: definition.manager.email,
        passwordHash,
        role: ROLES.MANAGER,
      },
    });

    const restaurant = await prisma.restaurant.create({
      data: {
        name: definition.name,
        slug: definition.slug,
        description: definition.description,
        cuisine: definition.cuisine,
        city: definition.city,
        addressLine: definition.addressLine,
        postcode: definition.postcode,
        priceBand: definition.priceBand,
        rating: definition.rating,
        heroImage: definition.heroImage,
        seatingMinutes: definition.seatingMinutes,
        openingHours: JSON.stringify(definition.openingHours),
        managerId: manager.id,
        tables: { create: definition.tables },
      },
      include: { tables: true },
    });

    venues.push({ restaurant, openingHours: definition.openingHours });
  }

  console.log('Creating reservations…');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const DAY_MS = 24 * 3600_000;

  // Accumulated and written in one batch — thousands of individual inserts is
  // needlessly slow.
  const rows = [];

  // Tracks what each venue already has booked, so the engine can guarantee the
  // seed never produces a clash.
  const placedByVenue = new Map(venues.map(({ restaurant }) => [restaurant.id, []]));

  // 28 days behind, 14 ahead.
  for (let offset = -28; offset <= 14; offset += 1) {
    const day = new Date(today.getTime() + offset * DAY_MS);
    const isPast = offset < 0;
    const isWeekend = [5, 6].includes(day.getDay());

    for (const { restaurant, openingHours } of venues) {
      const hours = hoursForDate(day, openingHours);
      if (!hours) continue;

      const sittings = candidateSittings(day, hours, restaurant.seatingMinutes);
      if (sittings.length === 0) continue;

      // Capacity is tables × turns per service, NOT tables × sittings: a
      // sitting occupies its table for seatingMinutes, which spans several of
      // the 30-minute candidate slots. Multiplying by sittings oversubscribes
      // the venue and leaves a diner with nothing bookable.
      const open = parseTimeToMinutes(hours.open);
      const close = parseTimeToMinutes(hours.close);
      const serviceMinutes = close <= open ? close + 24 * 60 - open : close - open;
      const turns = (serviceMinutes / restaurant.seatingMinutes) * restaurant.tables.length;

      // Fill roughly half the covers at the weekend, a third midweek, so there
      // are real gaps to find and real pressure on the dashboard.
      const density = (isWeekend ? 0.55 : 0.35) * (restaurant.priceBand >= 4 ? 0.75 : 1);
      const attempts = Math.round(turns * density);

      const placed = placedByVenue.get(restaurant.id);

      for (let i = 0; i < attempts; i += 1) {
        const startsAt = pick(sittings);
        const partySize = pick([1, 2, 2, 2, 2, 3, 4, 4, 4, 5, 6, 6, 8]);

        const window = {
          startsAt,
          endsAt: endOfSitting(startsAt, restaurant.seatingMinutes),
        };

        const table = allocateTable(restaurant.tables, partySize, window, placed);
        if (!table) continue;

        let status = RESERVATION_STATUS.CONFIRMED;
        if (isPast) {
          const roll = random();
          if (roll < 0.06) status = RESERVATION_STATUS.NO_SHOW;
          else if (roll < 0.14) status = RESERVATION_STATUS.CANCELLED;
          else status = RESERVATION_STATUS.COMPLETED;
        }

        placed.push({
          id: `seed-${rows.length}`,
          tableId: table.id,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          status,
        });

        rows.push({
          restaurantId: restaurant.id,
          tableId: table.id,
          userId: pick(diners).id,
          partySize,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          status,
          notes: pick(NOTES),
        });
      }
    }
  }

  // A small, hand-picked booking history for the demo account, so its
  // "My reservations" page is readable rather than a wall of rows.
  const demoBookings = [
    { venue: 'the-copper-hearth', dayOffset: 3, hour: 19, minute: 30, party: 2, status: RESERVATION_STATUS.CONFIRMED, note: 'Window table if possible.' },
    { venue: 'sakura-lane', dayOffset: 9, hour: 18, minute: 0, party: 4, status: RESERVATION_STATUS.CONFIRMED, note: 'Celebrating a birthday.' },
    { venue: 'casa-del-viento', dayOffset: -6, hour: 20, minute: 0, party: 6, status: RESERVATION_STATUS.COMPLETED, note: null },
    { venue: 'the-brass-monkey', dayOffset: -13, hour: 13, minute: 0, party: 3, status: RESERVATION_STATUS.COMPLETED, note: 'One vegetarian in the party.' },
    { venue: 'gupshup-canteen', dayOffset: -21, hour: 12, minute: 30, party: 2, status: RESERVATION_STATUS.CANCELLED, note: null },
  ];

  for (const booking of demoBookings) {
    const entry = venues.find((v) => v.restaurant.slug === booking.venue);
    if (!entry) continue;

    const { restaurant } = entry;
    const startsAt = new Date(today.getTime() + booking.dayOffset * DAY_MS);
    startsAt.setHours(booking.hour, booking.minute, 0, 0);

    const window = {
      startsAt,
      endsAt: endOfSitting(startsAt, restaurant.seatingMinutes),
    };

    const placed = placedByVenue.get(restaurant.id);
    const table = allocateTable(restaurant.tables, booking.party, window, placed);
    if (!table) continue;

    placed.push({
      id: `demo-${rows.length}`,
      tableId: table.id,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      status: booking.status,
    });

    rows.push({
      restaurantId: restaurant.id,
      tableId: table.id,
      userId: demoDiner.id,
      partySize: booking.party,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      status: booking.status,
      notes: booking.note,
    });
  }

  await prisma.reservation.createMany({ data: rows });

  console.log(`
Seed complete.
  ${venues.length} restaurants
  ${diners.length + 1} diners
  ${rows.length} reservations (${demoBookings.length} belong to the demo account)

Sign in with any of these — password: ${PASSWORD}

  Diner    asan@example.com
  Manager  elena@copperhearth.test   (The Copper Hearth)
  Manager  rosa@casadelviento.test   (Casa del Viento)
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
