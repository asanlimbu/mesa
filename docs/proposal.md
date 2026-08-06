# Project Proposal — Mesa

**Unit:** CMS22204 Full Stack Application Development (Level 5, 40 credits)
**Student:** Asan Limbu
**Project:** Mesa — a multi-restaurant table reservation platform

---

## 1. Problem statement and targeted user base

### The problem

Independent restaurants still take reservations by telephone, email and a paper
diary. The consequences are routine and expensive: tables double-booked, parties
seated at tables too small for them, no-shows nobody recorded, and a booking
process that requires the customer to ring during service — precisely when the
restaurant is least able to answer.

Diners have the mirror-image problem. There is no single place to see which
nearby restaurants genuinely have a table free at the time they want to eat.
Listing sites show that a restaurant *exists*; they do not show whether it can
seat four people at eight o'clock on Friday.

### Targeted user base

| Role | Who | What they do |
|---|---|---|
| **Diner** (`DINER`) | A member of the public booking a table | Search and filter restaurants, check real availability, book, then view, modify or cancel *their own* reservations |
| **Manager** (`MANAGER`) | The owner or front-of-house manager of one venue | Everything a diner can, plus administer *their own* restaurant: tables, the reservation queue, service statuses, and the analytics dashboard |

There is deliberately no platform-wide super-admin. It would add a third
permission tier and a user-management surface without demonstrating anything the
two-role model does not already demonstrate.

### Why multi-restaurant

A single restaurant's booking page would make search and filtering trivial, and
search is one of the three features the brief names as an advanced requirement.
Multiple venues give discovery real work to do, and they introduce
**ownership-scoped authorisation** — a materially harder and more realistic
security problem than a plain role check.

---

## 2. Objectives and goals

### Product objectives

- A diner can go from landing page to confirmed reservation without contacting
  the restaurant at all.
- Double-booking a table is **impossible by construction**, not by convention.
- A manager can answer "how did we do this month?" without exporting anything.
- A diner is told *which table* they will be given before they commit.

### Technical objectives

- Responsive React front end with state managed through Context and hooks.
- RESTful Express API with strict layering: routes → middleware → services →
  data. Routes never touch the ORM; services never touch `req` or `res`.
- Persistent relational storage through an ORM, with the schema under version
  control.
- Booking logic isolated as pure functions so it can be tested without a server
  or a database.

### Measures of success

| Goal | How it is demonstrated |
|---|---|
| No double-booking | An integration test fires two concurrent requests for the last table; exactly one succeeds |
| Genuine availability | Search filtered by date, time and party size returns only venues that could actually seat that party |
| Ownership enforced | A second manager receives 404 on another venue's records, and the record is verifiably unchanged |
| Correct allocation | A party of two is seated at the two-top, not the six-top |

---

## 3. High-level architecture and data flow

A rendered diagram is at [`architecture.svg`](./architecture.svg).

```
┌──────────────────────────────────────────────┐
│  Browser — React SPA (Vite)                  │
│  Pages · Components · Context · Router        │
└───────────────────┬──────────────────────────┘
                    │  JSON over HTTP, Bearer JWT
┌───────────────────▼──────────────────────────┐
│  Express                                     │
│  requestId → helmet → CORS → rate limit →    │
│  body → logger → authenticate → authorize    │
├──────────────────────────────────────────────┤
│  Services — auth · restaurants ·             │
│             reservations · stats             │
├──────────────────────────────────────────────┤
│  lib/availability.js — pure, no I/O          │
├──────────────────────────────────────────────┤
│  Prisma ORM                                  │
└───────────────────┬──────────────────────────┘
                    │
             SQLite (dev) / PostgreSQL (deploy)
```

Once built, the same Express process also serves the compiled React front end,
so one server answers both the pages and the API.

### Data flow — booking a table

1. The diner signs in; the client stores the returned JWT.
2. The client requests availability for a date and party size. The server runs
   every candidate sitting through the booking engine and returns each one
   flagged free or taken, **including the table it would allocate**.
3. The diner picks a time and submits. The client `POST`s to
   `/api/reservations` with the token.
4. `authenticate` verifies the signature and loads the user from the database —
   the token is a claim, not a source of truth.
5. The controller validates the request: restaurant exists, party size 1–20,
   time in the future and inside opening hours.
6. The service opens a **transaction**, loads tables large enough for the party,
   filters them through the engine, and takes the smallest survivor.
7. Availability is re-checked inside the transaction immediately before insert.
   This is what closes the race between two diners booking the last table.
8. No survivor → `409` carrying the nearest times that *are* free, so the
   interface can offer alternatives instead of a dead end.
9. Otherwise the reservation is committed and returned as `201`.

### Data model

`User` **1—n** `Restaurant` (a manager owns a venue)
`Restaurant` **1—n** `Table`, **1—n** `Reservation`
`Table` **1—n** `Reservation` · `User` **1—n** `Reservation` (a diner holds a booking)

A reservation occupies one table for a half-open window `[startsAt, endsAt)`.
Two conflict when they share a table and their windows overlap:

```js
overlaps(a, b) === a.startsAt < b.endsAt && a.endsAt > b.startsAt
```

Half-open intervals mean a table freed at 20:00 can be rebooked at 20:00
exactly, which is the behaviour a restaurant expects.

---

## 4. Technology and justification

| Layer | Choice | Why |
|---|---|---|
| Front end | React 19 + Vite | Unit requirement. Vite over CRA: CRA is deprecated and markedly slower. |
| State | Context + hooks | Auth and toasts are the only genuinely global state; Redux would be ceremony for two values. |
| Back end | Node.js + Express 5 | Unit requirement; continuous with the Week 7–8 lab work. |
| ORM | Prisma | Typed client, migrations in version control, portable across SQLite and PostgreSQL. |
| Database | SQLite (dev) / PostgreSQL (deploy) | Availability is a join across restaurant, table and reservation. A document store would push those joins into application code. |
| Auth | jsonwebtoken + bcrypt | Stateless tokens suit an SPA; bcrypt is the standard for password storage. |

### A note on the brief's ORM requirement

The brief specifies a Node.js back end and then asks students to "integrate a
Django ORM". Django's ORM is a Python component and cannot run on Node. Reading
the requirement by intent — persistence through an ORM rather than hand-written
SQL — **Prisma** satisfies it on the Node stack. This deviation is deliberate
and is documented here, in the design specification, and in the report.

It is also a demonstrable improvement on the Week 7–8 lab code, which used
string-concatenated SQL through the raw `sqlite3` driver and stored passwords in
plaintext.

---

## 5. Scope

**In scope:** the five must-have features (authentication with ownership-scoped
access, discovery with search/filter/sort, the reservation engine, the manager
dashboard, and diner reservation management), seed data, API documentation and
setup instructions.

**Deliberately out of scope:** payments and deposits, email or SMS
notifications, diner-written reviews, waitlists, multi-venue restaurant groups,
a platform super-admin, and real-time push updates. Each is a plausible
extension and each is listed as future work rather than built.
