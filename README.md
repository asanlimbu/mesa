# Mesa

A multi-restaurant table reservation platform. Diners search participating
restaurants by cuisine, city, price and genuine table availability, then book a
specific table. Restaurant managers administer their own venue: the reservation
queue, service statuses, and a dashboard reporting covers, occupancy and
no-shows.

Built for **CMS22204 Full Stack Application Development**, Level 5.
Author: Asan Limbu.

---

## Quick start

Requires Node.js 20 or newer.

```bash
npm run setup
```

That installs the root, server and client dependencies, creates the SQLite
database and seeds it. Then:

```bash
npm run dev
```

- Front end — http://localhost:5173
- API — http://localhost:4000

Both start together. The Vite dev server proxies `/api` to the Express server,
so the browser stays on one origin and there is no CORS preflight in
development.

### Demo accounts

All seeded accounts use the password `password123`.

| Role | Email | Sees |
|---|---|---|
| Diner | `asan@example.com` | 2 upcoming and 3 past bookings |
| Manager | `elena@copperhearth.test` | The Copper Hearth dashboard |
| Manager | `rosa@casadelviento.test` | Casa del Viento dashboard |

Signing in as a second manager is the quickest way to see ownership-scoped
authorisation: neither manager can read or change the other's reservations.

---

## Commands

| Command | Does |
|---|---|
| `npm run setup` | Install everything, create and seed the database |
| `npm run dev` | Run API and front end together with hot reload |
| `npm run build` | Production build of the front end |
| `npm start` | Run the API and serve the built front end |
| `npm test` | Run the server test suite |
| `npm run db:seed` | Re-seed the database (clears existing data first) |

Run `npm --prefix server run db:studio` to browse the database in Prisma Studio.

---

## Architecture

```
Browser — React SPA (Vite)
    │  JSON over HTTP, Bearer JWT
    ▼
Express API
    routes → middleware (authenticate, authorize) → controllers
    ▼
Services — auth · restaurants · reservations · stats
    ▼
lib/availability.js — pure booking logic, no I/O
    ▼
Prisma ORM → SQLite (dev) / PostgreSQL (deploy)
```

Each layer depends only on the one beneath it. Controllers never touch Prisma;
services never touch `req` or `res`. That boundary is what makes the services
testable and the database swap a connection-string change.

```
mesa/
├── server/
│   ├── prisma/schema.prisma   Data model
│   ├── prisma/seed.js         Deterministic seed data
│   ├── src/lib/availability.js  Booking engine — pure functions
│   ├── src/services/          Business logic
│   ├── src/routes/            HTTP surface
│   ├── src/middleware/        Auth and error handling
│   └── test/                  Unit tests
├── client/
│   └── src/
│       ├── components/TablePlan.jsx   The isometric floor plan
│       ├── pages/             One file per screen
│       ├── state/             Auth and toast contexts
│       └── lib/api.js         Single fetch wrapper
└── docs/
    ├── api.md                 Endpoint reference
    └── superpowers/specs/     Design specification
```

---

## How booking works

A reservation occupies one table for a window `[startsAt, endsAt)`, where
`endsAt` comes from the restaurant's configured seating duration. Two
reservations conflict when they share a table and their windows overlap:

```js
overlaps(a, b) === a.startsAt < b.endsAt && a.endsAt > b.startsAt
```

Half-open intervals mean a table freed at 20:00 can be rebooked at 20:00
exactly, which is how a restaurant actually works.

Allocation takes the **smallest table that seats the party**, so a couple does
not occupy a six-top while six-tops are the scarce resource. The write runs
inside a transaction that re-checks availability immediately before insert,
which closes the race between two diners booking the last table at the same
moment. When nothing is free the API answers `409` with the nearest times that
are still open, so the interface can offer alternatives instead of a dead end.

All of this lives in `server/src/lib/availability.js` as pure functions over
plain objects — no Prisma import, no Express import, no clock reads. That is why
it can be unit-tested directly, and it is the subject of most of the test suite.

---

## Security

- Passwords are hashed with bcrypt. Plaintext never reaches the database.
- JWTs carry only the user id and role; name and email are read from the
  database per request, so a stale token cannot present outdated identity.
- Sign-in returns an identical error for an unknown email and a wrong password,
  and compares against a dummy hash when the user does not exist, so the
  endpoint cannot be used to discover which addresses are registered.
- Authentication and authorisation are separate middleware: `authenticate`
  answers *who are you* (401), `authorize` answers *may you do this* (403).
- **Role alone is not sufficient.** A manager may only act on the venue they
  own, so manager handlers additionally assert
  `restaurant.managerId === req.user.id`. Cross-venue access returns **404, not
  403**, so the API never confirms the existence of records the caller cannot
  see.
- The server refuses to start in production with the development JWT secret.
- Client-side route guards exist for usability only. The server is the
  authority and is the only thing protecting the data.

---

## Testing

```bash
npm test
```

35 unit tests covering the booking engine, including the cases where a subtle
error would be invisible in a demo but wrong in production: back-to-back
bookings at the exact boundary, cancelled bookings correctly releasing their
table, a party that fits no table, bookings outside opening hours, and service
that runs past midnight.

---

## Notes on the brief

The brief asks for a Node.js back end and then for students to "integrate a
Django ORM". Django's ORM is a Python component and cannot run on Node. Reading
the requirement by intent — persistence through an ORM rather than hand-written
SQL — **Prisma** satisfies it on the Node stack, with migrations under version
control and portability to PostgreSQL. This deviation is deliberate and is
documented here, in the design specification and in the report.

SQLite cannot express Prisma's `enum` or `Json` types, so roles, reservation
statuses and opening hours are stored as validated strings. `src/lib/constants.js`
is the single source of truth for the permitted values. The schema moves to
PostgreSQL unchanged.

---

## Not built, deliberately

Payments and deposits, email or SMS notifications, diner-written reviews
(ratings are seeded), waitlists, multi-venue restaurant groups, a platform
super-admin, and real-time push updates. Each is a plausible extension; none is
needed to demonstrate the required features, and each would have taken time
away from the parts being assessed.
