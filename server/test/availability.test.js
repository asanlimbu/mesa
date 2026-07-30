import test from 'node:test';
import assert from 'node:assert/strict';

import {
  overlaps,
  isBlocking,
  endOfSitting,
  isTableFree,
  findFreeTables,
  allocateTable,
  parseTimeToMinutes,
  hoursForDate,
  isWithinOpeningHours,
  isValidPartySize,
  candidateSittings,
  suggestAlternatives,
  evaluateBooking,
} from '../src/lib/availability.js';

import { RESERVATION_STATUS } from '../src/lib/constants.js';

// A Thursday, so weekday lookups are unambiguous.
const at = (hhmm) => new Date(`2026-08-06T${hhmm}:00`);

const TABLES = [
  { id: 't2', label: 'T2', seats: 2 },
  { id: 't4', label: 'T4', seats: 4 },
  { id: 't6', label: 'T6', seats: 6 },
];

const OPENING_HOURS = {
  sun: null,
  mon: { open: '12:00', close: '22:00' },
  tue: { open: '12:00', close: '22:00' },
  wed: { open: '12:00', close: '22:00' },
  thu: { open: '12:00', close: '22:00' },
  fri: { open: '12:00', close: '23:00' },
  sat: { open: '11:00', close: '23:00' },
};

const booking = (overrides = {}) => ({
  id: 'r1',
  tableId: 't4',
  startsAt: at('19:00'),
  endsAt: at('20:30'),
  status: RESERVATION_STATUS.CONFIRMED,
  ...overrides,
});

test('overlaps: windows that share time overlap', () => {
  assert.equal(
    overlaps(
      { startsAt: at('19:00'), endsAt: at('20:30') },
      { startsAt: at('20:00'), endsAt: at('21:30') },
    ),
    true,
  );
});

test('overlaps: back-to-back windows do not overlap', () => {
  // The core half-open interval property: a table freed at 20:30 is bookable
  // at 20:30 exactly.
  assert.equal(
    overlaps(
      { startsAt: at('19:00'), endsAt: at('20:30') },
      { startsAt: at('20:30'), endsAt: at('22:00') },
    ),
    false,
  );
});

test('overlaps: a window fully containing another overlaps', () => {
  assert.equal(
    overlaps(
      { startsAt: at('18:00'), endsAt: at('22:00') },
      { startsAt: at('19:00'), endsAt: at('20:00') },
    ),
    true,
  );
});

test('overlaps: is symmetric', () => {
  const a = { startsAt: at('19:00'), endsAt: at('20:30') };
  const b = { startsAt: at('20:00'), endsAt: at('21:00') };
  assert.equal(overlaps(a, b), overlaps(b, a));
});

test('isBlocking: only pending, confirmed and seated hold a table', () => {
  assert.equal(isBlocking({ status: RESERVATION_STATUS.PENDING }), true);
  assert.equal(isBlocking({ status: RESERVATION_STATUS.CONFIRMED }), true);
  assert.equal(isBlocking({ status: RESERVATION_STATUS.SEATED }), true);
  assert.equal(isBlocking({ status: RESERVATION_STATUS.COMPLETED }), false);
  assert.equal(isBlocking({ status: RESERVATION_STATUS.CANCELLED }), false);
  assert.equal(isBlocking({ status: RESERVATION_STATUS.NO_SHOW }), false);
});

test('endOfSitting: adds the seating duration', () => {
  assert.deepEqual(endOfSitting(at('19:00'), 90), at('20:30'));
});

test('isTableFree: a clashing confirmed booking blocks the table', () => {
  assert.equal(
    isTableFree(
      { id: 't4' },
      { startsAt: at('20:00'), endsAt: at('21:30') },
      [booking()],
    ),
    false,
  );
});

test('isTableFree: a cancelled booking releases the table', () => {
  assert.equal(
    isTableFree(
      { id: 't4' },
      { startsAt: at('20:00'), endsAt: at('21:30') },
      [booking({ status: RESERVATION_STATUS.CANCELLED })],
    ),
    true,
  );
});

test('isTableFree: a booking on another table is irrelevant', () => {
  assert.equal(
    isTableFree(
      { id: 't6' },
      { startsAt: at('19:00'), endsAt: at('20:30') },
      [booking()],
    ),
    true,
  );
});

test('isTableFree: a booking being modified does not block itself', () => {
  assert.equal(
    isTableFree(
      { id: 't4' },
      { startsAt: at('19:30'), endsAt: at('21:00') },
      [booking()],
      { ignoreReservationId: 'r1' },
    ),
    true,
  );
});

test('findFreeTables: excludes tables too small for the party', () => {
  const free = findFreeTables(
    TABLES,
    5,
    { startsAt: at('19:00'), endsAt: at('20:30') },
    [],
  );
  assert.deepEqual(
    free.map((t) => t.id),
    ['t6'],
  );
});

test('findFreeTables: returns smallest sufficient table first', () => {
  const free = findFreeTables(
    TABLES,
    2,
    { startsAt: at('19:00'), endsAt: at('20:30') },
    [],
  );
  assert.deepEqual(
    free.map((t) => t.id),
    ['t2', 't4', 't6'],
  );
});

test('allocateTable: seats a pair at the two-top, not the six-top', () => {
  const table = allocateTable(
    TABLES,
    2,
    { startsAt: at('19:00'), endsAt: at('20:30') },
    [],
  );
  assert.equal(table.id, 't2');
});

test('allocateTable: steps up when the smaller table is taken', () => {
  const table = allocateTable(
    TABLES,
    2,
    { startsAt: at('19:00'), endsAt: at('20:30') },
    [booking({ tableId: 't2' })],
  );
  assert.equal(table.id, 't4');
});

test('allocateTable: returns null when every suitable table is taken', () => {
  const table = allocateTable(
    TABLES,
    5,
    { startsAt: at('19:00'), endsAt: at('20:30') },
    [booking({ tableId: 't6' })],
  );
  assert.equal(table, null);
});

test('parseTimeToMinutes: parses valid times', () => {
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('12:30'), 750);
  assert.equal(parseTimeToMinutes('23:59'), 1439);
  assert.equal(parseTimeToMinutes('9:05'), 545);
});

test('parseTimeToMinutes: rejects malformed and out-of-range values', () => {
  assert.equal(parseTimeToMinutes('24:00'), null);
  assert.equal(parseTimeToMinutes('12:60'), null);
  assert.equal(parseTimeToMinutes('noon'), null);
  assert.equal(parseTimeToMinutes(''), null);
  assert.equal(parseTimeToMinutes(null), null);
});

test('hoursForDate: maps a date to its weekday hours', () => {
  assert.deepEqual(hoursForDate(at('19:00'), OPENING_HOURS), {
    open: '12:00',
    close: '22:00',
  });
});

test('hoursForDate: returns null on a closed day', () => {
  const sunday = new Date('2026-08-09T19:00:00');
  assert.equal(hoursForDate(sunday, OPENING_HOURS), null);
});

test('isWithinOpeningHours: a sitting inside service is allowed', () => {
  assert.deepEqual(
    isWithinOpeningHours(
      { startsAt: at('19:00'), endsAt: at('20:30') },
      OPENING_HOURS,
    ),
    { ok: true },
  );
});

test('isWithinOpeningHours: a sitting that would run past closing is rejected', () => {
  // 21:00 + 90 minutes = 22:30, past a 22:00 close.
  const result = isWithinOpeningHours(
    { startsAt: at('21:00'), endsAt: at('22:30') },
    OPENING_HOURS,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'AFTER_CLOSING');
});

test('isWithinOpeningHours: a sitting before opening is rejected', () => {
  const result = isWithinOpeningHours(
    { startsAt: at('11:00'), endsAt: at('12:30') },
    OPENING_HOURS,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BEFORE_OPENING');
});

test('isWithinOpeningHours: a closed day is rejected', () => {
  const result = isWithinOpeningHours(
    {
      startsAt: new Date('2026-08-09T19:00:00'),
      endsAt: new Date('2026-08-09T20:30:00'),
    },
    OPENING_HOURS,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CLOSED_THAT_DAY');
});

test('isWithinOpeningHours: a sitting ending exactly at closing is allowed', () => {
  assert.deepEqual(
    isWithinOpeningHours(
      { startsAt: at('20:30'), endsAt: at('22:00') },
      OPENING_HOURS,
    ),
    { ok: true },
  );
});

test('isWithinOpeningHours: handles a service running past midnight', () => {
  const lateHours = { thu: { open: '18:00', close: '01:00' } };
  assert.deepEqual(
    isWithinOpeningHours(
      { startsAt: at('23:00'), endsAt: new Date('2026-08-07T00:30:00') },
      lateHours,
    ),
    { ok: true },
  );
});

test('isValidPartySize: accepts the permitted range', () => {
  assert.equal(isValidPartySize(1).ok, true);
  assert.equal(isValidPartySize(20).ok, true);
});

test('isValidPartySize: rejects zero, negatives, fractions and overflow', () => {
  assert.equal(isValidPartySize(0).ok, false);
  assert.equal(isValidPartySize(-2).ok, false);
  assert.equal(isValidPartySize(2.5).ok, false);
  assert.equal(isValidPartySize(21).ok, false);
  assert.equal(isValidPartySize('4').ok, false);
});

test('candidateSittings: last sitting leaves room for the full duration', () => {
  const sittings = candidateSittings(at('19:00'), OPENING_HOURS.thu, 90);
  const last = sittings[sittings.length - 1];

  assert.deepEqual(sittings[0], at('12:00'));
  assert.deepEqual(last, at('20:30')); // 20:30 + 90m = 22:00 close exactly
});

test('suggestAlternatives: offers the nearest genuinely free times', () => {
  // Only the six-top fits a party of five; block it at 19:00.
  const alternatives = suggestAlternatives({
    requestedAt: at('19:00'),
    partySize: 5,
    tables: TABLES,
    reservations: [booking({ tableId: 't6', id: 'blocker' })],
    openingHours: OPENING_HOURS,
    seatingMinutes: 90,
    limit: 2,
  });

  assert.equal(alternatives.length, 2);
  // 20:30 is the first slot after the blocker frees; 17:30 the nearest before.
  assert.deepEqual(alternatives[0], at('17:30'));
  assert.deepEqual(alternatives[1], at('20:30'));
});

test('evaluateBooking: allocates a table for a valid request', () => {
  const result = evaluateBooking({
    startsAt: at('19:00'),
    partySize: 2,
    tables: TABLES,
    reservations: [],
    openingHours: OPENING_HOURS,
    seatingMinutes: 90,
    now: at('10:00'),
  });

  assert.equal(result.ok, true);
  assert.equal(result.table.id, 't2');
  assert.deepEqual(result.window.endsAt, at('20:30'));
});

test('evaluateBooking: rejects a booking in the past', () => {
  const result = evaluateBooking({
    startsAt: at('19:00'),
    partySize: 2,
    tables: TABLES,
    reservations: [],
    openingHours: OPENING_HOURS,
    seatingMinutes: 90,
    now: at('20:00'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'IN_THE_PAST');
});

test('evaluateBooking: distinguishes a party nobody can ever seat', () => {
  const result = evaluateBooking({
    startsAt: at('19:00'),
    partySize: 12,
    tables: TABLES,
    reservations: [],
    openingHours: OPENING_HOURS,
    seatingMinutes: 90,
    now: at('10:00'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'PARTY_TOO_LARGE');
});

test('evaluateBooking: returns alternatives when the slot is taken', () => {
  const result = evaluateBooking({
    startsAt: at('19:00'),
    partySize: 5,
    tables: TABLES,
    reservations: [booking({ tableId: 't6', id: 'blocker' })],
    openingHours: OPENING_HOURS,
    seatingMinutes: 90,
    now: at('10:00'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'TABLE_UNAVAILABLE');
  assert.ok(result.alternatives.length > 0);
});

test('evaluateBooking: two parties cannot take the last table at once', () => {
  const window = { startsAt: at('19:00'), endsAt: at('20:30') };

  const first = evaluateBooking({
    startsAt: window.startsAt,
    partySize: 6,
    tables: TABLES,
    reservations: [],
    openingHours: OPENING_HOURS,
    seatingMinutes: 90,
    now: at('10:00'),
  });
  assert.equal(first.ok, true);

  // Simulate the first booking having been committed.
  const second = evaluateBooking({
    startsAt: window.startsAt,
    partySize: 6,
    tables: TABLES,
    reservations: [
      { id: 'r1', tableId: first.table.id, ...window, status: RESERVATION_STATUS.CONFIRMED },
    ],
    openingHours: OPENING_HOURS,
    seatingMinutes: 90,
    now: at('10:00'),
  });

  assert.equal(second.ok, false);
  assert.equal(second.reason, 'TABLE_UNAVAILABLE');
});

test('evaluateBooking: rejects an invalid date', () => {
  const result = evaluateBooking({
    startsAt: new Date('not a date'),
    partySize: 2,
    tables: TABLES,
    reservations: [],
    openingHours: OPENING_HOURS,
    seatingMinutes: 90,
    now: at('10:00'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INVALID_DATE');
});
