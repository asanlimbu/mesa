# Mesa API reference

Base URL `http://localhost:4000/api`. All requests and responses are JSON.

Authenticated endpoints expect the token in the header:

```
Authorization: Bearer <token>
```

## Error shape

Every deliberate rejection uses the same envelope, so the client can branch on
`code` rather than parse prose.

```json
{
  "error": {
    "code": "TABLE_UNAVAILABLE",
    "message": "No table is free at that time.",
    "details": { "alternatives": ["2026-08-13T16:30:00.000Z"] }
  }
}
```

| Status | Meaning |
|---|---|
| 400 | Validation failed, or the booking breaks a rule (closed, past, too large) |
| 401 | Missing, invalid or expired token |
| 403 | Authenticated, but the wrong account type |
| 404 | Does not exist — **also returned when a manager reaches another venue's records** |
| 409 | Conflict: email already registered, or no table free |
| 500 | Unexpected server fault |

Validation failures carry per-field messages so forms can annotate inputs:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Some fields need attention.",
  "details": { "fields": { "email": "Enter a valid email address." } } } }
```

---

## Authentication

### `POST /auth/register`

```json
{ "name": "Asan Limbu", "email": "asan@example.com", "password": "password123", "role": "DINER" }
```

`role` is optional and defaults to `DINER`. Returns `201` with `{ user, token }`.

### `POST /auth/login`

```json
{ "email": "asan@example.com", "password": "password123" }
```

Returns `{ user, token }`. An unknown email and a wrong password produce an
identical `401`, by design.

### `GET /auth/me` — *authenticated*

Returns `{ user }` for the bearer token.

---

## Restaurants — public

### `GET /restaurants`

| Parameter | Type | Notes |
|---|---|---|
| `q` | string | Matches name, description or cuisine |
| `cuisine` | string, repeatable | Exact match |
| `city` | string | Exact match |
| `priceBand` | 1–4, repeatable | |
| `date`, `time`, `partySize` | | Supply all three to filter by real availability |
| `sort` | `rating` \| `name` \| `price_asc` \| `price_desc` | Defaults to `rating` |
| `page`, `pageSize` | number | `pageSize` capped at 48, defaults to 12 |

```json
{ "restaurants": [ … ], "total": 6, "page": 1, "pageSize": 12, "pages": 1 }
```

Supplying `date`, `time` and `partySize` runs every match through the booking
engine, so results contain only venues that could actually seat the party.

### `GET /restaurants/filters`

`{ "cuisines": [...], "cities": [...] }` — derived from live data, for the
filter UI.

### `GET /restaurants/:identifier`

Accepts a slug or an id. Includes `tables` and parsed `openingHours`.

### `GET /restaurants/:identifier/availability`

`?date=2026-08-13&partySize=2`

```json
{
  "date": "2026-08-13",
  "closed": false,
  "partySize": 2,
  "slots": [
    {
      "startsAt": "2026-08-13T18:00:00.000Z",
      "available": true,
      "past": false,
      "freeTableIds": ["cm…a1", "cm…a3"],
      "tableId": "cm…a1",
      "tableLabel": "A1",
      "seats": 2
    }
  ]
}
```

`tableId` is the table the engine *would* allocate, not a guess — the floor plan
and the "you will be seated at" line both read from it. `past` marks sittings
that have already begun; they are never `available`.

---

## Reservations — *authenticated*

### `POST /reservations`

```json
{ "restaurantId": "cm…", "date": "2026-08-13", "time": "19:00", "partySize": 2, "notes": "Window table" }
```

`startsAt` as a full ISO string is accepted instead of `date` + `time`.
Returns `201` with the reservation including its restaurant, table and user.

On a clash, `409`:

```json
{ "error": { "code": "TABLE_UNAVAILABLE", "message": "No table is free at that time.",
  "details": { "alternatives": ["2026-08-13T15:30:00.000Z", "2026-08-13T16:00:00.000Z"] } } }
```

Other rejections return `400`: `PARTY_TOO_LARGE`, closed that day, before
opening, past closing, or a time that has already passed.

### `GET /reservations/mine`

`{ "upcoming": [ … ], "past": [ … ] }` for the signed-in diner.

### `GET /reservations/:id`

Readable by the diner who holds it or the manager of that venue. Anyone else
gets `404`.

### `PATCH /reservations/:id`

Change `partySize`, `startsAt` (or `date` + `time`), or `notes`. Re-runs
conflict detection and may move the booking to a different table. Only the
diner who made it may change it.

### `DELETE /reservations/:id`

Cancels. Refused within 2 hours of the sitting.

---

## Manager — *authenticated, `MANAGER` role*

Every endpoint additionally verifies the venue belongs to the caller. The client
never supplies a restaurant id; it is resolved from the token.

### `GET /manager/restaurant`

The manager's own venue, with tables.

### `GET /manager/reservations`

`?from=2026-07-30T00:00:00&to=2026-07-30T23:59:59&status=CONFIRMED`

The reservation queue, ascending by time.

### `PATCH /manager/reservations/:id/status`

```json
{ "status": "SEATED" }
```

Permitted: `CONFIRMED`, `SEATED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
A reservation at another venue returns `404`.

### `GET /manager/stats`

`?days=30` (1–365, defaults to 30)

```json
{
  "restaurant": { "id": "cm…", "name": "The Copper Hearth" },
  "windowDays": 30,
  "today": { "bookings": 17, "covers": 62 },
  "upcoming": { "bookings": 193, "covers": 665, "next": "2026-07-30T18:00:00.000Z" },
  "totals": { "bookings": 391, "covers": 1485, "averagePartySize": 3.8 },
  "occupancyRate": 0.366,
  "cancellationRate": 0.082,
  "noShowRate": 0.055,
  "tableCount": 8,
  "seatCount": 32,
  "series": [{ "date": "2026-07-01", "bookings": 12, "covers": 47 }],
  "busiestHours": [{ "hour": 18, "covers": 233 }]
}
```

Occupancy is reserved table-hours over available table-hours across the window.
`series` is zero-filled so the chart has no gaps on closed days.

---

## Data model

| Model | Fields |
|---|---|
| `User` | `id`, `name`, `email` (unique), `passwordHash`, `role`, `createdAt` |
| `Restaurant` | `id`, `name`, `slug` (unique), `description`, `cuisine`, `city`, `addressLine`, `postcode`, `priceBand` 1–4, `rating`, `heroImage`, `seatingMinutes`, `openingHours`, `managerId`, `createdAt` |
| `Table` | `id`, `restaurantId`, `label`, `seats` |
| `Reservation` | `id`, `restaurantId`, `tableId`, `userId`, `partySize`, `startsAt`, `endsAt`, `status`, `notes`, `createdAt` |

Relations: a `User` with role `MANAGER` owns `Restaurant`s; a `Restaurant` has
many `Table`s and `Reservation`s; a `Reservation` belongs to one `Table`, one
`Restaurant` and one `User`.

Indexes on `Reservation(tableId, startsAt, endsAt)` and
`Reservation(restaurantId, startsAt)` — every availability query filters on
those columns.

**Reservation statuses:** `PENDING`, `CONFIRMED`, `SEATED`, `COMPLETED`,
`CANCELLED`, `NO_SHOW`. Only the first three hold a table; the rest release it
and are ignored by conflict detection.

`role`, `status` and `openingHours` are strings rather than Prisma `enum`/`Json`
because SQLite supports neither. They are validated against
`server/src/lib/constants.js`, and the schema moves to PostgreSQL unchanged.

---

## Configuration

`server/.env`, copied from `.env.example`. Every value has a working development
default except `JWT_SECRET` in production, which the server refuses to start
without.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Prisma connection string |
| `PORT` | `4000` | API port |
| `NODE_ENV` | `development` | Enables production checks when `production` |
| `JWT_SECRET` | dev value | Token signing key |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
