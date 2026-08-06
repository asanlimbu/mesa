# Mesa — Restaurant Reservation Platform

**Design specification**
**Author:** Asan Limbu
**Date:** 30 July 2026
**Unit:** CMS22204 Full Stack Application Development (Level 5, 40 credits)
**Deadline:** 7 August 2026

---

## 1. Problem statement

Independent restaurants manage reservations by phone, email and paper diary. The
consequences are routine: double-booked tables, parties seated at tables too small
for them, no-shows nobody tracked, and a booking process that requires the customer
to call during opening hours. Diners, meanwhile, have no single place to see which
nearby restaurants actually have a table free at the time they want to eat.

Mesa is a multi-restaurant reservation platform. Diners search participating
restaurants by cuisine, city, price band and — critically — by genuine table
availability for a given date, time and party size. Restaurant managers administer
their own venue: tables, opening hours, the reservation queue, and a dashboard
reporting covers, occupancy and no-shows.

### Why multi-restaurant

A single restaurant's booking page would make search and filtering trivial, and
search is one of three features the assessment brief names as an advanced
requirement. Multiple venues give discovery real work to do, and introduce
ownership-scoped authorisation (below), which is a materially harder and more
realistic security problem than plain role checks.

## 2. Target users

| Role | Who | What they can do |
|---|---|---|
| **Diner** (`DINER`) | Member of the public booking a table | Search and filter restaurants, check availability, book, view/modify/cancel *their own* reservations |
| **Manager** (`MANAGER`) | Owner or front-of-house manager of one venue | Everything a diner can, plus manage *their own* restaurant: tables, opening hours, reservation statuses, and the analytics dashboard |

There is deliberately no platform super-admin. It would add a third permission tier
and a user-management surface without demonstrating anything the two-role model does
not already demonstrate. Cut under YAGNI.

## 3. Objectives

**Product**

- A diner can go from landing page to confirmed reservation without contacting the restaurant.
- Double-booking a table is impossible by construction, not by convention.
- A manager can answer "how did we do this month?" without exporting anything.

**Technical**

- Responsive React front end with state managed through Context plus hooks.
- RESTful Express API with layered separation: routes → controllers → services → data.
- Persistent relational storage through an ORM, with schema migrations under version control.
- Booking logic isolated as pure functions, testable without a server or database.

## 4. Five must-have features

These map onto the brief's "Core Features (Advanced Requirement)" section, which
requires authentication with role-based access, search/filtering/sorting, and a
dashboard or reporting feature.

### F1 — Authentication and ownership-scoped access control

Registration and login issue a JWT carrying `{ userId, role }`. Passwords are hashed
with bcrypt (cost 10); plaintext passwords never touch the database.

Two middleware layers, deliberately separate:

- `authenticate` — verifies the bearer token, attaches `req.user`, else 401.
- `authorize(...roles)` — checks `req.user.role`, else 403.

Role alone is not sufficient for manager routes. A `MANAGER` may only act on the
restaurant they own, so manager handlers additionally assert
`restaurant.managerId === req.user.id` and return 404 (not 403) when it fails, so
the API does not confirm the existence of resources the caller cannot see. This
ownership check is the security core of the application: without it, any manager
could read and modify every other restaurant's bookings.

Client-side route guards mirror the server rules for usability only. The server is
the authority; the client guard is a convenience and is never trusted.

### F2 — Restaurant discovery: search, filter, sort

`GET /api/restaurants` accepts:

| Parameter | Effect |
|---|---|
| `q` | Case-insensitive substring match on restaurant name and description |
| `cuisine` | Exact match, repeatable |
| `city` | Exact match |
| `priceBand` | 1–4, repeatable |
| `date`, `time`, `partySize` | Availability filter — only venues with a suitable free table |
| `sort` | `name`, `price_asc`, `price_desc`, `rating` |
| `page`, `pageSize` | Pagination, default 12 per page |

The availability filter is what distinguishes this from a directory: it composes the
reservation engine (F3) into the search query, so results reflect real bookable
capacity rather than a static listing.

### F3 — Reservation engine with conflict detection

A reservation occupies one table for a window `[startsAt, endsAt)`, where `endsAt`
is derived from the restaurant's configured seating duration (default 90 minutes).

Two reservations conflict when they share a table and their windows overlap:

```
overlaps(a, b) === a.startsAt < b.endsAt && a.endsAt > b.startsAt
```

Half-open intervals mean a table freeing at 20:00 can be rebooked at 20:00 exactly,
which is the behaviour a restaurant expects.

Allocation picks the *smallest* table that seats the party, so a party of two does not
consume a six-top while six-tops remain the scarce resource. Booking runs inside a
database transaction that re-checks availability immediately before insert, closing
the race between two diners booking the last table simultaneously.

This logic lives in `server/src/lib/availability.js` as pure functions over plain
objects — no Prisma import, no Express import, no clock reads. It is therefore
directly unit-testable, and it is the natural target for the brief's optional
testing deliverable.

### F4 — Manager dashboard and reporting

Server-computed metrics for the authenticated manager's restaurant:

- Covers today, and upcoming reservations
- Occupancy rate — reserved table-hours over available table-hours
- Bookings over the last 30 days, as a time series
- No-show and cancellation rates
- Busiest service times, bucketed by hour

Rendered as stat tiles plus charts. Charts are hand-built SVG rather than a charting
dependency: the data shapes are simple, and it avoids adding a library to explain in
the demo.

### F5 — Reservation management for diners

Diners list their own reservations split into upcoming and past, with a status
timeline (`PENDING → CONFIRMED → SEATED`, or `CANCELLED` / `NO_SHOW`). They may
modify party size or time — which re-runs conflict detection and may reallocate the
table — or cancel, subject to the restaurant's cancellation window.

## 5. Data model

```
User 1───n Restaurant          (manager owns venue)
Restaurant 1───n Table
Restaurant 1───n Reservation
Table 1───n Reservation
User 1───n Reservation         (diner holds booking)
```

| Model | Fields |
|---|---|
| `User` | `id`, `name`, `email` (unique), `passwordHash`, `role`, `createdAt` |
| `Restaurant` | `id`, `name`, `slug` (unique), `description`, `cuisine`, `city`, `addressLine`, `postcode`, `priceBand` (1–4), `rating`, `heroImage`, `seatingMinutes`, `openingHours` (JSON), `managerId`, `createdAt` |
| `Table` | `id`, `restaurantId`, `label`, `seats` |
| `Reservation` | `id`, `restaurantId`, `tableId`, `userId`, `partySize`, `startsAt`, `endsAt`, `status`, `notes`, `createdAt` |

Indexes on `Reservation(tableId, startsAt, endsAt)` and `Reservation(restaurantId, startsAt)` — every availability query filters on those columns.

`openingHours` holds a JSON string (`{ mon: { open: "12:00", close: "22:00" } | null, … }`),
parsed at the service boundary. It is read as a whole and never queried by field, so
normalising it into a table would add a join for no gain. SQLite cannot express
Prisma's `Json` or `enum` types, so this column and the `role`/`status` columns are
plain strings validated against `src/lib/constants.js` — a constraint that keeps the
schema portable to PostgreSQL unchanged.

**Statuses:** `PENDING`, `CONFIRMED`, `SEATED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
Only `PENDING`, `CONFIRMED` and `SEATED` hold a table; the rest release it and are
excluded from conflict checks.

## 6. Architecture

```
┌──────────────────────────────────────────────┐
│  Browser — React SPA (Vite)                  │
│  Pages · Components · Context (auth, toast)  │
└───────────────────┬──────────────────────────┘
                    │  JSON over HTTP, Bearer JWT
┌───────────────────▼──────────────────────────┐
│  Express API                                 │
│  routes → middleware → controllers           │
│           (authenticate, authorize, errors)  │
├──────────────────────────────────────────────┤
│  Services — business logic                   │
│  auth · restaurants · reservations · stats   │
├──────────────────────────────────────────────┤
│  lib/availability.js — pure, no I/O          │
├──────────────────────────────────────────────┤
│  Prisma ORM                                  │
└───────────────────┬──────────────────────────┘
                    │
             SQLite (dev) / PostgreSQL (deploy)
```

Each layer depends only on the one beneath. Controllers never touch Prisma;
services never touch `req` or `res`. That boundary is what makes the services
testable and the swap from SQLite to PostgreSQL a connection-string change.

### Request walkthrough — booking a table

1. Diner submits the booking form; React `POST`s to `/api/reservations` with the JWT.
2. `authenticate` verifies the signature and expiry, attaches `req.user`.
3. The controller validates the body (restaurant exists, party size 1–20, time in the future, within opening hours).
4. `reservationService.create` opens a transaction, loads candidate tables with `seats >= partySize`, filters them through `availability.js`, and takes the smallest survivor.
5. No survivor → `409 Conflict` with the next three available times, so the UI can offer alternatives instead of a dead end.
6. Otherwise insert and commit; respond `201` with the reservation.
7. The manager's dashboard reflects it on next load.

## 7. Technology choices

| Layer | Choice | Why |
|---|---|---|
| Front end | React 19 + Vite | Unit requirement. Vite over Create React App: CRA is deprecated and its dev server is markedly slower. |
| Routing | React Router | Needed for guarded routes and shareable restaurant URLs. |
| State | Context + hooks | Auth and toasts are the only genuinely global state. Redux would be ceremony for two values. |
| Styling | Tailwind CSS | Fast iteration on a bespoke visual design without inventing a class taxonomy. |
| Motion | Framer Motion | Scroll reveals and 3D tilt at low cost. |
| Back end | Node.js + Express 5 | Unit requirement; continuous with the Week 7–8 lab work. |
| ORM | Prisma | See note below. Typed client, migrations in version control, portable across SQLite and PostgreSQL. |
| Database | SQLite dev / PostgreSQL deploy | Reservations are inherently relational — availability is a join across restaurant, table and reservation. A document store would need application-side joins for the core query. |
| Auth | jsonwebtoken + bcrypt | Stateless tokens suit a SPA; bcrypt is the standard for password storage. |

### Note on the brief's ORM requirement

The brief specifies a Node.js back end and then asks students to "integrate a Django
ORM". Django's ORM is a Python component and cannot be used from Node. Reading the
requirement by intent — persistence through an ORM rather than hand-written SQL —
Prisma satisfies it on the Node stack. This deviation is deliberate and documented
here and in the report.

It is also a genuine improvement on the Week 7–8 lab code, which used string-
concatenated SQL through the raw `sqlite3` driver and stored passwords in plaintext.

## 8. Error handling

One `AppError` class carrying an HTTP status and a machine-readable code. Services
throw it; a single Express error middleware serialises it:

```json
{ "error": { "code": "TABLE_UNAVAILABLE", "message": "…", "details": { } } }
```

Unexpected exceptions log server-side with a stack trace and return a generic 500 —
internal detail is never leaked to the client. Validation failures return 400 with
per-field messages so forms can annotate the offending inputs. `409` is reserved for
booking conflicts and carries suggested alternative times.

## 9. Testing strategy

| Level | Target |
|---|---|
| Unit | `lib/availability.js` — overlap detection, boundary times, table allocation, opening-hours checks |
| Unit | `lib/validation.js` — party size, date parsing, email format |
| Integration | Supertest against the Express app on a throwaway SQLite file: register → login → search → book → double-book returns 409 → cancel |
| Integration | Authorisation: manager A receives 404 on manager B's reservations |

Node's built-in `node:test` runner, so the test deliverable adds no dependency.

Boundary cases that must be covered: back-to-back bookings at the exact same instant;
a party that fits no table; a booking outside opening hours; a cancelled reservation
correctly freeing its table.

## 10. Visual design

A premium editorial aesthetic — deep near-black canvas, warm amber accent, large
display serif against a clean sans, generous whitespace, photography treated as the
hero element.

Depth comes primarily from CSS 3D transforms and motion rather than WebGL:
`perspective` and `rotateX/Y` tilt on restaurant cards, layered parallax on the hero,
scroll-triggered reveals, and specular sheen on hover. This buys most of the visual
impact for hours rather than days, adds no runtime dependency, and does not risk the
performance and accessibility criteria the brief evaluates. A contained WebGL hero
may be added if the schedule allows, behind `prefers-reduced-motion`.

All motion respects `prefers-reduced-motion`. Target AA contrast throughout, visible
focus rings, and full keyboard operability of the booking flow.

## 11. Scope boundaries

**In scope:** the five features above, seed data covering several venues, API
documentation, setup instructions.

**Out of scope, deliberately:** payments and deposits; email or SMS notifications;
diner reviews (rating is seeded, not user-generated); waitlists; multi-venue
restaurant groups; a platform super-admin; real-time push updates. Each is a
plausible extension and each is listed as future work in the report rather than
built.

**Optional deliverables**, taken in this order if time allows: (1) unit and
integration tests, (2) Docker packaging, (3) cloud deployment. The architecture
supports all three without restructuring — configuration is environment-driven with
working defaults, booking logic is I/O-free, and data access is confined behind
Prisma.

## 12. Deliverables

| Item | Weight |
|---|---|
| Face-to-face demonstration of the working application | 75% |
| 500-word report (PDF, Canvas) against the project description template | 25% |
| GitHub repository containing all code | Mandatory supplementary |
| 10-minute pre-recorded walkthrough video | Required alongside the presentation |
