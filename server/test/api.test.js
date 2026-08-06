/**
 * API integration tests.
 *
 * These exercise the real Express app over HTTP against a real database. The
 * unit suite proves the booking engine is correct in isolation; this suite
 * proves the wiring around it — auth, authorisation, transactions, error
 * shapes — behaves as the API contract promises.
 *
 * The authorisation tests are the important ones. Ownership scoping is the
 * security property this system rests on, and asserting it in prose is not the
 * same as proving a second manager gets a 404.
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import {
  resetDatabase,
  seedFixtures,
  futureSitting,
  isoOf,
  PASSWORD,
} from './helpers/fixtures.js';

const app = createApp();

let fixtures;
let dinerToken;
let otherDinerToken;
let managerOneToken;
let managerTwoToken;

const signIn = async (email) => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD });

  assert.equal(response.status, 200, `sign-in failed for ${email}`);
  return response.body.token;
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  fixtures = await seedFixtures();

  [dinerToken, otherDinerToken, managerOneToken, managerTwoToken] = await Promise.all([
    signIn('diner@test.local'),
    signIn('other@test.local'),
    signIn('one@test.local'),
    signIn('two@test.local'),
  ]);
});

after(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

/* ── Health ──────────────────────────────────────────────────────────────── */

test('health reports the database it depends on', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.database.status, 'ok');
});

test('every response carries a request id', async () => {
  const response = await request(app).get('/api/health');
  assert.match(response.headers['x-request-id'], /[0-9a-f-]{36}/);
});

/* ── Authentication ──────────────────────────────────────────────────────── */

test('registration issues a usable token', async () => {
  const response = await request(app).post('/api/auth/register').send({
    name: 'New Person',
    email: 'new@test.local',
    password: 'a-good-password',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, 'new@test.local');
  assert.equal(response.body.user.role, 'DINER');
  assert.ok(!('passwordHash' in response.body.user), 'must never return the hash');

  const me = await request(app).get('/api/auth/me').set(auth(response.body.token));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'new@test.local');
});

test('registering a taken email is refused', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Impostor', email: 'diner@test.local', password: 'a-good-password' });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'EMAIL_TAKEN');
});

test('registration validates its fields', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'x', email: 'not-an-email', password: 'short' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_FAILED');
  assert.ok(response.body.error.details.fields.email);
  assert.ok(response.body.error.details.fields.password);
});

test('a wrong password and an unknown email are indistinguishable', async () => {
  const wrongPassword = await request(app)
    .post('/api/auth/login')
    .send({ email: 'diner@test.local', password: 'not-the-password' });

  const unknownEmail = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nobody@test.local', password: 'not-the-password' });

  // Identical status and message, or the endpoint enumerates accounts.
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.body.error.message, unknownEmail.body.error.message);
});

test('protected routes reject a missing or malformed token', async () => {
  const noToken = await request(app).get('/api/reservations/mine');
  assert.equal(noToken.status, 401);

  const rubbish = await request(app)
    .get('/api/reservations/mine')
    .set(auth('not-a-real-token'));
  assert.equal(rubbish.status, 401);
});

/* ── Discovery ───────────────────────────────────────────────────────────── */

test('search filters by city and cuisine', async () => {
  const london = await request(app).get('/api/restaurants?city=London');
  assert.equal(london.status, 200);
  assert.equal(london.body.total, 1);
  assert.equal(london.body.restaurants[0].slug, 'alpha');

  const japanese = await request(app).get('/api/restaurants?cuisine=Japanese');
  assert.equal(japanese.body.restaurants[0].slug, 'beta');
});

test('search sorts by price', async () => {
  const ascending = await request(app).get('/api/restaurants?sort=price_asc');
  assert.deepEqual(
    ascending.body.restaurants.map((r) => r.slug),
    ['alpha', 'beta'],
  );
});

test('an unknown sort falls back rather than erroring', async () => {
  // A bad sort in a shared URL should still return results.
  const response = await request(app).get('/api/restaurants?sort=nonsense');
  assert.equal(response.status, 200);
  assert.equal(response.body.total, 2);
});

test('availability reports the table the engine would allocate', async () => {
  const date = isoOf(futureSitting()).slice(0, 10);

  const response = await request(app).get(
    `/api/restaurants/alpha/availability?date=${date}&partySize=2`,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.closed, false);

  const bookable = response.body.slots.find((slot) => slot.available);
  assert.ok(bookable, 'expected at least one free sitting');
  // Smallest sufficient table: a pair gets the two-top, not the six.
  assert.equal(bookable.tableLabel, 'A2');
  assert.ok(bookable.freeTableIds.length > 0);
});

test('a restaurant that does not exist is a 404', async () => {
  const response = await request(app).get('/api/restaurants/does-not-exist');
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

/* ── Booking ─────────────────────────────────────────────────────────────── */

const book = (token, overrides = {}) =>
  request(app)
    .post('/api/reservations')
    .set(auth(token))
    .send({
      restaurantId: fixtures.alpha.id,
      startsAt: isoOf(futureSitting()),
      partySize: 2,
      ...overrides,
    });

test('a diner can book, and gets the smallest sufficient table', async () => {
  const response = await book(dinerToken);

  assert.equal(response.status, 201);
  assert.equal(response.body.table.label, 'A2');
  assert.equal(response.body.status, 'CONFIRMED');
  assert.equal(response.body.restaurant.slug, 'alpha');
});

test('booking requires authentication', async () => {
  const response = await request(app)
    .post('/api/reservations')
    .send({ restaurantId: fixtures.alpha.id, startsAt: isoOf(futureSitting()), partySize: 2 });

  assert.equal(response.status, 401);
});

test('the same table cannot be booked twice', async () => {
  const sitting = isoOf(futureSitting());

  // Alpha has one table of each size, so three parties of six exhaust it.
  const first = await book(dinerToken, { startsAt: sitting, partySize: 6 });
  assert.equal(first.status, 201);
  assert.equal(first.body.table.label, 'A6');

  const second = await book(otherDinerToken, { startsAt: sitting, partySize: 6 });

  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'TABLE_UNAVAILABLE');
  assert.ok(
    Array.isArray(second.body.error.details.alternatives),
    'a conflict must offer alternatives rather than a dead end',
  );
});

test('concurrent bookings for the last table cannot both win', async () => {
  const sitting = isoOf(futureSitting(4));

  // Fired together: the transaction, not the ordering, is what must hold.
  const results = await Promise.all([
    book(dinerToken, { startsAt: sitting, partySize: 6 }),
    book(otherDinerToken, { startsAt: sitting, partySize: 6 }),
  ]);

  const created = results.filter((r) => r.status === 201);
  const refused = results.filter((r) => r.status === 409);

  assert.equal(created.length, 1, 'exactly one booking should succeed');
  assert.equal(refused.length, 1, 'the other should be refused');

  const held = await prisma.reservation.count({
    where: { restaurantId: fixtures.alpha.id, status: 'CONFIRMED' },
  });
  assert.equal(held, 1);
});

test('a party larger than any table is refused', async () => {
  const response = await book(dinerToken, { partySize: 20 });

  assert.equal(response.status, 400);
  assert.match(response.body.error.message, /no table large enough/i);
});

test('a sitting in the past is refused', async () => {
  const past = new Date();
  past.setDate(past.getDate() - 1);

  const response = await book(dinerToken, { startsAt: isoOf(past) });
  assert.equal(response.status, 400);
});

test('a diner sees only their own bookings', async () => {
  await book(dinerToken);
  await book(otherDinerToken, { partySize: 4 });

  const mine = await request(app).get('/api/reservations/mine').set(auth(dinerToken));

  assert.equal(mine.status, 200);
  assert.equal(mine.body.upcoming.length, 1);
  assert.equal(mine.body.upcoming[0].user.id, fixtures.diner.id);
});

test('a diner cannot read another diner’s booking', async () => {
  const created = await book(otherDinerToken);

  const response = await request(app)
    .get(`/api/reservations/${created.body.id}`)
    .set(auth(dinerToken));

  // 404 rather than 403: the API must not confirm the record exists.
  assert.equal(response.status, 404);
});

test('cancelling releases the table', async () => {
  const sitting = isoOf(futureSitting(5));

  const created = await book(dinerToken, { startsAt: sitting, partySize: 6 });
  assert.equal(created.status, 201);

  const cancelled = await request(app)
    .delete(`/api/reservations/${created.body.id}`)
    .set(auth(dinerToken));

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.status, 'CANCELLED');

  // The six-top is free again.
  const rebooked = await book(otherDinerToken, { startsAt: sitting, partySize: 6 });
  assert.equal(rebooked.status, 201);
  assert.equal(rebooked.body.table.label, 'A6');
});

/* ── Manager authorisation ───────────────────────────────────────────────── */

test('a diner cannot reach manager routes', async () => {
  const response = await request(app).get('/api/manager/stats').set(auth(dinerToken));

  // 403: the caller is known, the role is wrong.
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('a manager sees their own venue and its bookings', async () => {
  await book(dinerToken);

  const venue = await request(app)
    .get('/api/manager/restaurant')
    .set(auth(managerOneToken));
  assert.equal(venue.status, 200);
  assert.equal(venue.body.slug, 'alpha');

  const queue = await request(app)
    .get('/api/manager/reservations')
    .set(auth(managerOneToken));
  assert.equal(queue.status, 200);
  assert.equal(queue.body.length, 1);
});

test('a manager cannot read another venue’s reservation', async () => {
  const created = await book(dinerToken);

  const response = await request(app)
    .get(`/api/reservations/${created.body.id}`)
    .set(auth(managerTwoToken));

  // Manager Two owns Beta, not Alpha. 404, not 403.
  assert.equal(response.status, 404);
});

test('a manager cannot change another venue’s reservation', async () => {
  const created = await book(dinerToken);

  const response = await request(app)
    .patch(`/api/manager/reservations/${created.body.id}/status`)
    .set(auth(managerTwoToken))
    .send({ status: 'NO_SHOW' });

  assert.equal(response.status, 404);

  // And it really was not changed.
  const unchanged = await prisma.reservation.findUnique({ where: { id: created.body.id } });
  assert.equal(unchanged.status, 'CONFIRMED');
});

test('a manager can move their own booking through the service lifecycle', async () => {
  const created = await book(dinerToken);

  const seated = await request(app)
    .patch(`/api/manager/reservations/${created.body.id}/status`)
    .set(auth(managerOneToken))
    .send({ status: 'SEATED' });

  assert.equal(seated.status, 200);
  assert.equal(seated.body.status, 'SEATED');
});

test('a manager cannot set a status outside the permitted set', async () => {
  const created = await book(dinerToken);

  const response = await request(app)
    .patch(`/api/manager/reservations/${created.body.id}/status`)
    .set(auth(managerOneToken))
    .send({ status: 'NOT_A_STATUS' });

  assert.equal(response.status, 400);
});

test('dashboard stats are scoped to the calling manager', async () => {
  await book(dinerToken);

  const alpha = await request(app).get('/api/manager/stats').set(auth(managerOneToken));
  const beta = await request(app).get('/api/manager/stats').set(auth(managerTwoToken));

  assert.equal(alpha.status, 200);
  assert.equal(alpha.body.restaurant.name, 'Alpha');
  assert.equal(alpha.body.upcoming.bookings, 1);

  // Beta has had no bookings, and must not see Alpha's.
  assert.equal(beta.body.restaurant.name, 'Beta');
  assert.equal(beta.body.upcoming.bookings, 0);
});

/* ── Error contract ──────────────────────────────────────────────────────── */

test('an unknown route returns the standard error envelope', async () => {
  const response = await request(app).get('/api/not-a-route');

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
  assert.ok(response.body.error.requestId);
});

test('malformed JSON is rejected as a client error', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email": broken}');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'MALFORMED_JSON');
});
