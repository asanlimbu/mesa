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

For a single-server run closer to a deployment — Express serving the compiled
React app *and* the API on one port — use `npm start` and open
http://localhost:4000.

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
| `npm start` | Build the front end, then serve it **and** the API from one Node process on :4000 |
| `npm test` | Run all 65 tests (unit and integration) |
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
├── package.json                    Root scripts — setup, dev, build, test
│
├── server/                         Express API
│   ├── .env.example                Copy to .env before first run
│   ├── prisma/
│   │   ├── schema.prisma           Data model
│   │   └── seed.js                 Deterministic seed data
│   ├── src/
│   │   ├── index.js                Entry point
│   │   ├── app.js                  Express app (exported unlistened, for tests)
│   │   ├── config.js               Environment, read once at startup
│   │   ├── db.js                   Prisma client singleton
│   │   ├── lib/
│   │   │   ├── availability.js     Booking engine — pure, no I/O
│   │   │   ├── constants.js        Roles and statuses, single source of truth
│   │   │   ├── errors.js           One AppError type
│   │   │   ├── token.js            JWT sign and verify
│   │   │   └── validation.js       Input parsing, pure
│   │   ├── middleware/             auth, errors, request logging, rate limits
│   │   ├── services/               Business logic — never touches req/res
│   │   └── routes/                 HTTP surface — never touches Prisma
│   └── test/
│       ├── availability.test.js   35 unit tests on the booking engine
│       ├── api.test.js            30 integration tests over HTTP
│       └── helpers/fixtures.js    Known estate for the integration suite
│
├── client/                         React front end (Vite)
│   ├── public/                     Hero video and poster
│   └── src/
│       ├── main.jsx                Routes and guards
│       ├── index.css               Design tokens and global rules
│       ├── components/
│       │   ├── Layout.jsx          Shell: top bar, outlet, footer
│       │   ├── TablePlan3D.jsx     WebGL floor plan
│       │   ├── furniture.jsx       Tables and chairs geometry
│       │   ├── FloorPlan.jsx       Picks 3D or the flat fallback
│       │   ├── TablePlan.jsx       Flat CSS fallback plan
│       │   ├── Select.jsx          Custom listbox (WAI-ARIA)
│       │   ├── charts.jsx          Hand-built SVG charts
│       │   └── ui.jsx              Buttons, fields, reveals
│       ├── pages/                  One file per screen
│       ├── state/                  Auth and toast contexts
│       └── lib/                    api.js, format.js, motion.js
│
└── docs/
    ├── proposal.md                 Project proposal (brief deliverable 1)
    ├── architecture.svg            Architecture and data-flow diagram
    ├── design-spec.md              Full design specification
    ├── api.md                      Endpoint reference and data model
    ├── report.md                   The 500-word report (source)
    └── report.pdf                  The 500-word report (Canvas submission)
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

## Running it in earnest

The API is set up to survive contact with a real environment, not just a demo.

- **Security headers** via Helmet, and `x-powered-by` disabled so the server
  does not advertise what it is.
- **Rate limiting** in three tiers. Credentials get 10 failures per 15 minutes
  per IP, counted only against *failed* attempts, so signing in from several
  devices is never punished — an unthrottled login endpoint is an offline
  password cracker with a network hop in front of it. Writes get 30/minute,
  everything else 300/minute.
- **A request id** on every response and inside every error body. It is the
  only handle a user has on a specific request, so "it broke" can be traced to
  a log line.
- **A health check that means something.** `/api/health` probes the database
  and answers 503 if it cannot reach it. A check that only proves the process
  is alive would keep a load balancer routing traffic to an instance that
  cannot serve a single request.
- **Graceful shutdown.** SIGTERM stops new connections, lets in-flight requests
  finish, then closes the database — with a 10-second backstop so a hung
  request cannot keep a dying process alive. Killing the process mid-transaction
  is how a booking gets half-written.
- **`trust proxy` in production**, so the rate limiter sees the real client IP
  rather than throttling every user as if they were the proxy.

---

## Testing

```bash
npm test
```

**65 tests, in two suites.**

**35 unit tests** on the booking engine (`server/test/availability.test.js`) —
the cases where a subtle error would be invisible in a demo but wrong in
production: back-to-back bookings at the exact boundary, cancelled bookings
releasing their table, a party that fits no table, sittings outside opening
hours, and service running past midnight.

**30 integration tests** (`server/test/api.test.js`) driving the real Express
app over HTTP with Supertest, against a database of its own. These prove the
wiring the unit suite cannot see:

| Area | What is proven |
|---|---|
| Authentication | Registration, token round-trip, and that a wrong password and an unknown email are byte-for-byte indistinguishable |
| Booking | Smallest sufficient table allocated; double-booking refused with alternatives; **two concurrent requests for the last table cannot both win**; cancelling frees the table |
| Authorisation | A diner cannot read another diner's booking; a diner gets 403 on manager routes; **a manager gets 404 — not 403 — on another venue's records**, and the record is verifiably unchanged |
| Contract | Request id on every response and every error; validation returns per-field messages; malformed JSON is a 400 |

The authorisation tests matter most. Ownership scoping is the security property
this system rests on, and asserting it in a README is not the same as proving a
second manager receives a 404.

Integration tests run against `server/test.db`, created and reset per run, so
they never touch development data.

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
