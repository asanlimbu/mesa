# Mesa — the one-page summary

Everything else is detail. If you know this page, you can hold a conversation
about the project.

---

## 1. What it is

> "Mesa is a table-reservation platform for independent restaurants. Diners
> search by cuisine, city, price and **real** availability, then book a specific
> table. Managers get a dashboard for their own venue — the service sheet, and
> reporting on covers, occupancy and no-shows."

**Stack:** React 19 + Vite · Express 5 · Prisma ORM · SQLite
**Size:** 44 source files, ~6,700 lines, 65 passing tests

---

## 2. The two halves

### Front end — what happens when you open the site

```
index.html          One HTML file, containing one EMPTY div
   ↓
main.jsx            createRoot() fills that div with React
   ↓                Wraps everything in Router + Auth + Toast
Layout.jsx          Navbar and footer, once, for every page
   ↓
The page matching the URL   (Landing, Discover, RestaurantDetail…)
```

**The idea that unlocks React:** the whole site is *one empty HTML file*.
JavaScript builds every screen. That's why moving between pages never reloads.

### Back end — what happens when a request arrives

```
middleware/    the doorman   — checks you before you get in
routes/        the waiter    — writes down what you want
services/      the chef      — does the real work
lib/           the tools     — small, pure, no database
prisma/        the pantry    — the database
```

**The one rule:** work flows *downward*. The waiter never cooks; the chef never
answers the door.

---

## 3. The journey to know cold

A diner clicks **Book** at 19:30:

| # | Where | What happens |
|---|---|---|
| 1 | `client/src/lib/api.js` | `POST /api/reservations` + bearer token |
| 2 | `middleware/logging.js` | Request gets a unique id |
| 3 | `middleware/security.js` | Rate limit — 30 writes/min |
| 4 | `middleware/auth.js` | Token → user, **loaded from the database** |
| 5 | `routes/reservation.routes.js` | Validates, calls the service |
| 6 | `services/reservation.service.js` | **Transaction:** re-read → decide → write |
| 7 | `lib/availability.js` | `overlaps()` + smallest free table |
| 8 | — | `201 Created`, or `409` + nearby free times |

If you can narrate those eight steps naming the file each time, you can pass the
viva.

---

## 4. The six facts that win marks

**1. Half-open intervals.**
```js
a.startsAt < b.endsAt && a.endsAt > b.startsAt
```
`<` not `<=`, so a table freed at 20:00 rebooks at 20:00. Otherwise the table
sits dead a slot and the restaurant loses a cover every turn.

**2. The race condition.** Availability check and write happen in **one
transaction**, with the clash query re-read *inside* it. Otherwise two people
both see the last table free and both book it. Proved by a test that fires two
concurrent bookings and asserts one 201 and one 409.

**3. The JWT is signed, not encrypted.** Anyone can read it; nobody can change
it. That's why it carries only an id and a role.

**4. 404, not 403.** Ask for a restaurant you don't own and the API says "does
not exist". 403 would confirm it's real and let someone enumerate IDs.
**OWASP A01.**

**5. The login dummy hash.** Unknown email still runs a bcrypt comparison
against a fake hash — otherwise unknown emails answer faster and an attacker
identifies real accounts **by timing alone**.

**6. Client-side guards are UX, not security.** `Protected` in `main.jsx` only
keeps signed-out users off screens that would fail anyway. Delete it and you see
an empty dashboard, because the **server** is what actually refuses.

---

## 5. Smallest table that fits

Party of 2 does **not** get the 6-seater — otherwise a party of 6 later can't be
seated at all. Be honest: this is **greedy, not optimal**. A globally optimal
plan is bin-packing.

---

## 6. Weak spots — volunteer these

- Greedy table allocation, not optimal
- `prisma db push` instead of versioned migrations
- 3D bundle is ~975 kB, should be code-split
- No payments, notifications or deployment

Naming your own limits reads as competence. Getting caught not knowing one
reads as the opposite.

---

## 7. Demo checklist

1. `npm run dev` **already running** before you walk in
2. Sign in as **both** roles — password `password123`
   - Diner: `asan@example.com`
   - Manager: `elena@copperhearth.test`
   - A *second* manager is the fastest proof of ownership scoping
3. Have `lib/availability.js` open in a tab — show the four lines, don't describe them
4. Run `npm test` in front of them — 65 passing
5. Press `Ctrl+C` if asked about shutdown — it prints "Closed cleanly."

**If you don't know: "I don't know — I'd look at X."** Every marker prefers that
to invention, and they can always tell.
