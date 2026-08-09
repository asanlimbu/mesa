# Mesa — a walkthrough for the demonstration

Study notes. Read this with VS Code open beside you and actually click through to
each file as it comes up. If you can explain sections 3 and 4 without looking,
you can survive any question in the viva.

---

## 1. The thirty-second answer

> "Mesa is a table-reservation platform for independent restaurants. Diners
> search by cuisine, city, price and — the important one — *real* availability,
> then book a specific table. Managers get a dashboard for their own venue: the
> service sheet, and reporting on covers, occupancy and no-shows.
>
> It's a React front end, an Express API, and a SQLite database through Prisma.
> The part I'd point at is the booking engine: it's written as pure functions
> with no database access, which is why I could get 65 tests around it."

**Do not say more than this unless asked.** Let them ask.

---

## 2. The map — what lives where, and why

Open the folder in VS Code. Two applications, one repository.

```
mesa/
├── server/          Express API  (the back end)
├── client/          React app    (the front end)
└── docs/            Documentation
```

### The server, in the order a request meets it

| File | Its one job |
|---|---|
| `src/index.js` | Starts the process. Graceful shutdown lives here. |
| `src/app.js` | Builds the Express app: middleware, then routes. |
| `src/middleware/` | Cross-cutting concerns: security, logging, auth, errors. |
| `src/routes/` | URL → which service function. Nothing else. |
| `src/services/` | Business rules. The only layer allowed to touch Prisma. |
| `src/lib/` | Pure helpers. **No database, no Express.** |
| `prisma/schema.prisma` | The database definition. |

**The rule that shapes the whole back end:** a request flows *down* —
route → service → Prisma — and never sideways. A route never queries the
database. A `lib/` function never knows Express exists.

**Why they'll ask, and what to say:**
> "So each layer has one reason to change. If the URL scheme changes I touch
> routes. If a booking rule changes I touch services. If neither, `lib/` is
> untouched — which is why the booking logic is testable without a server or a
> database running."

### The client

| Folder | Contains |
|---|---|
| `src/pages/` | One file per screen (Landing, Discover, RestaurantDetail, …) |
| `src/components/` | Reusable pieces (charts, floor plan, buttons) |
| `src/state/` | React Context — auth and toasts, the only genuinely global state |
| `src/lib/api.js` | Every `fetch` call in the app, in one place |

---

## 3. Follow one request all the way through

**This is the section to know cold.** A diner clicks "Book" at 19:30.

### Step 1 — The browser

`client/src/lib/api.js` sends:

```
POST /api/reservations
Authorization: Bearer eyJhbGciOi...
{ "restaurantId": "...", "startsAt": "2026-08-09T19:30:00.000Z", "partySize": 2 }
```

Every API call goes through this one file, so the token is attached in exactly
one place rather than scattered through twenty components.

### Step 2 — Middleware (`src/app.js`)

In order: Helmet sets security headers → rate limiter → request ID → JSON
parser → **`authenticate`**.

### Step 3 — `authenticate` (`src/middleware/auth.js:23`)

Reads the bearer token, verifies the signature, then — the bit worth pointing
out —

```js
const user = await prisma.user.findUnique({ where: { id: userId }, ... });
if (!user) throw unauthorized('Your account no longer exists.');
```

> **Q: Why load the user from the database? The token already has the id.**
> "Because a token stays valid until it expires. If an account is deleted, a
> token in someone's browser would still work. Loading the user each request
> means a deleted account stops working immediately."

### Step 4 — Route (`src/routes/reservation.routes.js`)

Validates the request body, then calls `reservationService.create(...)`.
The route contains **no booking logic at all**.

### Step 5 — The service (`src/services/reservation.service.js:85`)

This is the heart. Read it in VS Code now.

```js
return prisma.$transaction(async (tx) => {
  const window = { startsAt, endsAt: endOfSitting(startsAt, restaurant.seatingMinutes) };

  const reservations = await loadClashing(tx, restaurant.id, window);   // ① inside the transaction
  const result = evaluateBooking({ ... });                              // ② pure decision
  if (!result.ok) throw rejectionToError(result);

  return tx.reservation.create({ ... });                                // ③ write
});
```

Three things happen, and the order matters:

1. **Load only reservations that could clash**, *inside* the transaction.
2. **Decide** — a pure function, no I/O.
3. **Write.**

### Step 6 — Response

`201 Created` with the booking. If nothing was free: `409 Conflict`, plus a list
of nearby times that *are* available.

> **Q: Why 409 and not 400?**
> "400 means the request was malformed. This request was perfectly well-formed —
> the table just went. 409 Conflict is the right code for 'valid request, but it
> conflicts with the current state'."

---

## 4. The booking engine — the hard part

Open `server/src/lib/availability.js`.

### 4a. Overlap detection (`availability.js:27`)

The entire clash rule is one line:

```js
export function overlaps(a, b) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}
```

Two bookings clash if each starts before the other ends.

> **Q: Why `<` and not `<=`?**
> This is the question I would ask you. The answer:
>
> "The intervals are **half-open** — `[start, end)`. The end instant belongs to
> the *next* booking. So a table that frees at 20:00 can be rebooked at 20:00
> exactly. With `<=` the table would sit artificially dead for a slot, and the
> restaurant would lose a cover every turn."

**Draw this on the whiteboard if they ask:**

```
Booking A:  18:30 ──────────── 20:00
Booking B:                     20:00 ──────────── 21:30
                                 ↑
                    not a clash — A has ended
```

### 4b. Which table gets allocated (`availability.js:79`)

```js
export function findFreeTables(tables, partySize, window, reservations, options = {}) {
  return tables
    .filter((table) => table.seats >= partySize)          // big enough
    .filter((table) => isTableFree(table, window, ...))   // actually free
    .sort((a, b) => a.seats - b.seats || ...);            // smallest first
}
```

Then `allocateTable` takes the first one.

> **Q: Why the smallest table that fits?**
> "Greedy best-fit. If a party of two takes the six-seater, a party of six
> later can't be seated at all. Allocating the smallest sufficient table keeps
> the large tables free for parties that actually need them."

Be honest if pushed: **this is greedy, not optimal.** A globally optimal
seating plan is a bin-packing problem. Say so — it shows you know the limit of
your own solution.

### 4c. Which statuses block a table (`availability.js:40`)

```js
export function isBlocking(reservation) {
  return BLOCKING_STATUSES.includes(reservation.status);   // PENDING, CONFIRMED, SEATED
}
```

`COMPLETED`, `CANCELLED` and `NO_SHOW` have **released** the table.

### 4d. The race condition — *the* question to be ready for

> **Q: Two people book the last table at the same instant. What happens?**

```js
prisma.$transaction(async (tx) => {
  const reservations = await loadClashing(tx, ...);  // re-read INSIDE the transaction
  ...
});
```

Say this:

> "Checking availability and writing the booking have to be one atomic unit.
> If I checked outside the transaction, both requests could see the table free,
> both pass the check, and both write — a double booking.
>
> Re-reading inside the transaction closes that window. One transaction commits;
> the other sees the new row and is rejected with a 409.
>
> And I don't just claim that — there's a test that fires two bookings for the
> last table concurrently with `Promise.all` and asserts exactly one 201 and one
> 409."

That test is in `server/test/api.test.js`. **Find it and read it before the
demo.**

---

## 5. Authentication and authorisation

Three separate ideas. Marks are lost by muddling them.

| Concept | Question it answers | Failure code | Where |
|---|---|---|---|
| **Authentication** | Who are you? | 401 | `middleware/auth.js:23` |
| **Authorisation** | May your *role* do this? | 403 | `middleware/auth.js:68` |
| **Ownership** | May you touch *this record*? | **404** | `restaurant.service.js:260` |

### Passwords

Stored with **bcrypt**, never plaintext. Bcrypt is deliberately *slow* and
salted, so two identical passwords produce different hashes and brute-forcing
is expensive.

### The token — be precise here

`lib/token.js:15` — a JWT carrying only `sub` (user id) and `role`.

> **Q: Is the token encrypted?**
> **"No — it's signed, not encrypted."** Anyone can base64-decode a JWT and read
> the payload. What they can't do is *change* it, because the signature would no
> longer verify against the server's secret. That's why the token holds only an
> id and a role, and nothing private.

### The 404-not-403 decision — a strong point to volunteer

Manager A asks for Manager B's restaurant. The API returns **404 Not Found**,
not 403 Forbidden.

> "403 would confirm the record exists — that's an information leak. An attacker
> could enumerate valid ids by watching which ones return 403 and which return
> 404. Answering 404 for 'exists but isn't yours' means the API never confirms
> the existence of anything the caller isn't entitled to see."

This maps to **OWASP A01: Broken Access Control**, which is cited in the report.

---

## 6. The database

Open `server/prisma/schema.prisma`.

Four models: **User → Restaurant → Table → Reservation.**

```
User ─┬─ manages ──→ Restaurant ──→ Table
      └─ books ────→ Reservation ←─┘
```

Things worth pointing at:

- **Indexes.** `@@index([tableId, startsAt, endsAt])` on Reservation. Every
  availability query filters on exactly those three columns, so the index
  matches the query.
- **Cascade deletes.** Delete a restaurant, its tables and reservations go too —
  no orphaned rows.
- **SQLite compromises, documented at the top of the file.** SQLite has no
  `enum` type, so `role` and `status` are strings validated in
  `lib/constants.js` before they reach the database. `openingHours` is a JSON
  string parsed in the service layer.

> **Q: Why SQLite and not PostgreSQL?**
> "It's a single file — the whole project clones and runs with no database
> server to install, which matters for a project that has to be handed in and
> run by someone else. The Prisma schema is portable: changing the provider to
> `postgresql` and adding real enums is the whole migration."

> **Q: Why an ORM at all?**
> "Reservations are relational — checking availability joins restaurant, table
> and reservation. A document database would push those joins up into my
> application code. Prisma also gives me parameterised queries, so SQL injection
> isn't reachable through it."

> **Q (be ready): How would you deploy a schema change?**
> Answer honestly: **"I used `prisma db push`, which is fine for development but
> isn't versioned. For production I'd switch to `prisma migrate`, which
> generates a migration file per change so the schema history is in version
> control and deployable."** Admitting this scores better than bluffing.

---

## 7. The front end

- **React 19 + Vite.** Vite for fast dev builds and hot reload.
- **State:** `useState` locally; React **Context** for the two things that are
  genuinely global — the signed-in user (`state/auth.jsx`) and toasts
  (`state/toast.jsx`). No Redux, because there's very little global state and
  Redux would be ceremony without benefit.
- **`lib/api.js`** — every network call, one file.
- **3D floor plan** — `TablePlan3D.jsx`, using three.js via react-three-fiber,
  with a flat CSS fallback in `TablePlan.jsx` for machines without WebGL.
- **Charts** — `components/charts.jsx`, hand-written SVG. No chart library:
  one line series and one bar series didn't justify the dependency.

> **Q: Why did you build the charts yourself?**
> "The data is one series of daily counts and one set of hourly totals. A
> charting library would have added a large dependency for something that's
> about eighty lines of SVG. Each chart also carries an `aria-label` summary,
> because an SVG means nothing to a screen reader."

### One honest bug story — tell this one, it lands well

The dashboard chart labels were **one day early**. Cause: `toISOString()`
converts to UTC, and during British Summer Time local midnight is the *previous*
day in UTC. Fix: a local-time date formatter in `client/src/lib/format.js`.

Bug stories like this are the single most convincing thing you can offer. They
prove you were in the code.

---

## 8. Testing

**65 tests, all passing.** Run them live if you're asked:

```bash
npm test
```

Two kinds:

- **Unit tests** — `server/test/availability.test.js`. The engine is pure, so
  these need no database and no server. Boundary cases: back-to-back bookings,
  services running past midnight, a party nobody can seat.
- **Integration tests** — `server/test/api.test.js`, using Supertest. Real HTTP
  against a real test database, including the concurrency test.

> **Q: Why is the engine pure?**
> "Precisely so it can be tested like this. If the clash rule needed a database
> connection, each of those tests would need fixtures and teardown. As pure
> functions they're instant, so I wrote far more edge cases than I otherwise
> would have."

---

## 9. Questions you will be asked — quick answers

| Question | Answer |
|---|---|
| Biggest challenge? | Correctness, not features. Half-open intervals, midnight-spanning services, and the timezone bug. |
| Why Express over Django? | The whole stack is JavaScript, so one language front to back. Prisma fills the ORM role. |
| How do you stop double booking? | Availability check and write in one transaction, with the clash query re-read inside it. |
| SQL injection? | Prisma parameterises every query. No string-built SQL anywhere. |
| What's not finished? | Payments, email notifications, deployment. No versioned migrations. |
| What would you do differently? | Versioned migrations from day one, and code-split the 3D bundle — it's ~975 kB. |
| How is the front end served? | After `npm run build`, Express serves the compiled React app, so one process serves API and UI on port 4000. |

---

## 10. Before you walk in

1. **`npm run dev`, and have it already running.** Never debug live.
2. **Sign in as both roles** — `asan@example.com` and
   `elena@copperhearth.test`, password `password123`. Signing in as a
   *second* manager is the fastest way to demonstrate ownership scoping.
3. **Have `availability.js` open in a tab.** When they ask about clashes, show
   the four lines rather than describing them.
4. **Run `npm test` in front of them.** 65 passing tests is evidence.
5. **Know your own weak spots** — greedy allocation, `db push`, the 3D bundle
   size. Volunteering a limitation reads as competence. Being caught not knowing
   one reads as the opposite.

**If you don't know something, say "I don't know — I'd look at X."** Every
marker prefers that to invention, and they can always tell.
