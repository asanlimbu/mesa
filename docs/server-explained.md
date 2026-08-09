# The server, explained file by file

Every file in `server/`, in the order a request meets them. Plain language
first, then the detail, then what to say if you're asked.

Keep VS Code open at `server/src/` and open each file as you reach it.

---

## The big idea, before any code

Think of the server as a **restaurant kitchen**.

| In a kitchen | In the server | Folder |
|---|---|---|
| The door and the doorman | Middleware — checks you before you get in | `middleware/` |
| The waiter who takes your order | Routes — writes down what you want | `routes/` |
| The chef who actually cooks | Services — the real work | `services/` |
| Knives, scales, recipes | Lib — small tools that do one job | `lib/` |
| The pantry | Database, via Prisma | `prisma/` |

**The one rule:** work flows *downward* — door → waiter → chef → pantry.
The waiter never cooks. The chef never answers the door.

> **Why this matters (say this if asked):** "Each layer has one reason to
> change. If a URL changes I edit routes. If a booking rule changes I edit
> services. The tools in `lib/` never change for either, which is why they're
> testable on their own."

---

# PART 1 — Turning the server on

## 1.1 `src/config.js` — the settings sheet

**Baby version:** a list of settings, read once when the server wakes up.
Port number, database location, the secret key for tokens.

Every setting has a **default**, so someone who clones your project can run it
with no setup at all.

Then this, which is the bit worth showing:

```js
if (isProduction && (jwtSecret === DEV_SECRET || jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must be set to a strong value (32+ characters) in production.');
}
```

**In plain words:** in development the secret key is `dev-secret-change-me`.
That's fine on your laptop. But if the server ever runs in *production* with
that secret still in place, it **refuses to start**.

> **Q: Why refuse to start? Isn't crashing worse?**
> "No. The secret is what signs the login tokens. If it's a value anyone can
> guess, anyone can forge a token and log in as any user — including a manager.
> A server that won't start is a visible problem someone fixes in a minute. A
> server running with a guessable secret is an invisible one. **Fail loudly, not
> silently.**"

Note `Object.freeze(...)` — config can't be modified after startup by accident.

## 1.2 `src/db.js` — one connection to the database

Eighteen lines. It creates **one** Prisma client and shares it everywhere.

> **Q: Why only one?**
> "Every Prisma client opens its own pool of database connections. If each file
> made its own, the app would open dozens of pools and eventually exhaust the
> database's connection limit. Node caches modules, so importing this file
> anywhere returns the same single client."

## 1.3 `src/index.js` — the ignition key

This starts the server listening. But most of the file is about **stopping**
properly, which is the interesting part.

```js
async function shutdown(signal) {
  // 1. stop accepting new connections
  // 2. let requests already running finish
  // 3. close the database
}
process.on('SIGINT',  () => shutdown('SIGINT'));   // you pressing Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM'));  // the system asking it to stop
```

**Baby version:** when the server is told to stop, it doesn't slam the door on
customers already inside. It stops letting new people in, lets the people
already being served finish, *then* locks up.

> **Q: Why does that matter?**
> "Because a booking is a database transaction. Killing the process mid-request
> could cut off a transaction as it commits. Graceful shutdown lets in-flight
> requests finish first."

And the backstop:

```js
const forced = setTimeout(() => { process.exit(1); }, SHUTDOWN_GRACE_MS);  // 10 seconds
```

If a request hangs forever, the server doesn't wait forever — it gives up after
10 seconds and exits anyway.

Last part:

```js
process.on('uncaughtException', (error) => { shutdown('uncaughtException'); });
```

> **Q: Why exit on an unexpected error instead of carrying on?**
> "A process that has thrown an error nobody caught is in an unknown state — I
> can't be sure its memory or connections are still sane. Serving traffic from
> it risks giving wrong answers. Logging and exiting means the broken instance
> leaves and a healthy one replaces it."

---

# PART 2 — `src/app.js`, the assembly line

This builds the Express app. **Order is everything here.** Middleware runs
top to bottom, like a queue of security checks at an airport.

```js
app.use(requestId);         // 1. give the request a name tag
app.use(helmet({...}));     // 2. security headers
app.use(cors({...}));       // 3. who is allowed to call us
app.use(generalLimiter);    // 4. rate limit
app.use(express.json());    // 5. read the body
app.use(requestLogger);     // 6. log it
// 7. routes
app.use(notFoundHandler);   // 8. nothing matched
app.use(errorHandler);      // 9. anything broke  ← must be LAST
```

**Learn why this order, it's a classic exam question:**

| Position | Reason |
|---|---|
| Request id **first** | Everything after it can be tagged with the same id |
| Rate limit **before** body parsing | A flood of requests gets rejected *before* the server spends effort reading megabytes of JSON |
| Logger **after** the id | So the log line has an id to print |
| Error handler **last** | Express only sends an error here if nothing above handled it |

Two small hardening touches:

```js
app.disable('x-powered-by');      // stop announcing "I am Express"
if (config.isProduction) app.set('trust proxy', 1);
```

> **Q: What's `trust proxy` for?**
> "In a real deployment there's a proxy in front of the server, so every request
> arrives from the proxy's IP. Without this the rate limiter would see one IP
> for everybody and throttle all users together. This tells Express to read the
> real client IP from the `X-Forwarded-For` header."

### The health check

```js
app.get('/api/health', asyncHandler(async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; }
  catch { return res.status(503).json({ status: 'unhealthy', ... }); }
  ...
}));
```

**Baby version:** a "are you OK?" endpoint. But it doesn't just say "I'm
alive" — it actually asks the database a trivial question (`SELECT 1`) first.

> **Q: Why touch the database?**
> "A check that only proves the process is running tells a load balancer
> nothing. The process can be perfectly alive and unable to serve a single
> request because the database is down. Then it answers 503 and the load
> balancer stops sending it traffic."

### Serving the React app

At the bottom, if `client/dist` exists, Express serves the built front end too.

```js
app.get(/^\/(?!api\/).*/, (_req, res) => { ... res.sendFile('index.html'); });
```

**Baby version:** "any address that isn't `/api/...` and isn't a real file —
hand back the React page and let React Router figure it out."

That's why `/restaurants/sakura-lane` works if you refresh the page. The server
doesn't know that address; React does.

The caching rule underneath is worth a sentence:

- Asset files have a hash in the name (`index-CT_uwPVE.js`) → cache for a year.
- `index.html` → **never** cache, or visitors keep loading the old build's
  script tags after you deploy.

---

# PART 3 — The middleware, one by one

## 3.1 `middleware/logging.js` — name tags and the diary

```js
req.id = req.get('x-request-id') ?? randomUUID();
res.set('X-Request-Id', req.id);
```

Every request gets a unique id, sent back to the browser in a header.

> **Q: Why bother?**
> "When a user reports 'it broke', the only thing they can reliably give me is
> that id. The error handler puts it in the error response, so the user can read
> it off the screen and I can find that exact request in the logs."

Two details showing care:

- Logs are **JSON in production** (a log tool can parse it) and a **short line
  in development** (readable in your terminal).
- `/api/health` is skipped unless it fails — otherwise a health check every few
  seconds drowns the log.
- **The body is never logged.** That would put passwords in the log file.

## 3.2 `middleware/security.js` — rate limiting

Three limits, because different doors carry different risk:

| Limiter | Applies to | Limit |
|---|---|---|
| `authLimiter` | login / register | 10 **failures** per 15 min |
| `writeLimiter` | creating bookings | 30 per minute |
| `generalLimiter` | everything else | 300 per minute |

> **Q: Why is login stricter?**
> "An unthrottled login endpoint is a password cracker with a network hop in
> front of it — an attacker can try millions of passwords. Ten failures per
> fifteen minutes makes that pointless."

The clever bit:

```js
skipSuccessfulRequests: true,
```

Only **failed** logins count. So you signing in on your phone, laptop and
tablet is never punished — only someone guessing wrong repeatedly.

## 3.3 `middleware/auth.js` — who are you, and may you?

**Two separate jobs, and muddling them loses marks.**

```js
authenticate  →  Who are you?          →  401 if unknown
authorize     →  May your ROLE do it?  →  403 if not allowed
```

Inside `authenticate`:

```js
const { userId } = verifyToken(token);
const user = await prisma.user.findUnique({ where: { id: userId }, ... });
if (!user) throw unauthorized('Your account no longer exists.');
```

> **Q: The token already contains the user id. Why hit the database?**
> "Because a token stays valid until it expires — seven days here. If an account
> is deleted, a token sitting in someone's browser would still work for the rest
> of that week. Loading the user each request means a deleted account stops
> working immediately."

There is also `optionalAuthenticate`: used for browsing restaurants, which
works signed out but shows more when signed in. An invalid token there just
means "treat them as a visitor" rather than an error.

**And a third idea neither of these covers — ownership.** More in Part 6.

## 3.4 `middleware/error.js` — the single exit

Every failure in the whole app leaves through this one function.

```js
if (error instanceof AppError) {
  return res.status(error.status).json(withRequestId(error.toJSON()));
}
// ... otherwise ...
console.error('[unhandled]', error);
return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' } });
```

**Baby version, and this is the key sentence:**

- Errors **I meant to happen** ("that table is taken") → proper status + message.
- Errors I **didn't** mean → logged in full on the server, but the user only
  sees a bare 500.

> **Q: Why hide the real error from the user?**
> "Stack traces and database errors leak my file paths, table names and column
> names — that's a map of the system for an attacker. The full detail goes to
> the server log, where I can read it and the user can't."

It also translates one Prisma error specially:

```js
if (error?.code === 'P2002') { ... 409 ALREADY_EXISTS ... }
```

`P2002` is Prisma's "unique constraint failed" — e.g. registering with an email
that's taken. That's a *user* outcome, not a bug, so it gets a real message.

Finally:

```js
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
```

**Baby version:** a wrapper so that if an `async` route throws, the error still
reaches the error handler instead of vanishing. That's why every route in the
project is wrapped in `asyncHandler(...)`.

---

# PART 4 — `lib/`, the toolbox

These files have **no database and no Express**. Pure tools. That is exactly
why they're easy to test.

## 4.1 `lib/errors.js` — one error type

```js
export class AppError extends Error {
  constructor(status, code, message, details) { ... }
}
export const notFound   = (m) => new AppError(404, 'NOT_FOUND', m);
export const conflict   = (code, m, d) => new AppError(409, code, m, d);
```

Every deliberate rejection is an `AppError` carrying its own HTTP status. So a
service can just `throw notFound(...)` and the right status reaches the browser,
without the service knowing anything about Express.

## 4.2 `lib/constants.js` — the vocabulary

SQLite can't do enums through Prisma, so this file **is** the enum.

```js
export const BLOCKING_STATUSES = Object.freeze([
  RESERVATION_STATUS.PENDING,
  RESERVATION_STATUS.CONFIRMED,
  RESERVATION_STATUS.SEATED,
]);
```

**This is the most important constant in the project.** These three statuses
still occupy a table. `COMPLETED`, `CANCELLED` and `NO_SHOW` have **released**
it, so they never block a new booking.

## 4.3 `lib/validation.js` — checking input

Pure functions that return either a clean value or a map of field errors.

```js
export function passwordProblem(value) {
  if (value.length < 8) return 'Password must be at least 8 characters.';
  ...
}
```

> **Q: Why no "must contain a capital and a symbol" rule?**
> "Length is what actually resists brute force. Complexity rules mostly push
> people towards predictable substitutions like `P@ssw0rd!`, which are in every
> cracking dictionary."

Also note `parseRestaurantQuery`: a bad `sort` value in a shared URL **falls
back to the default instead of erroring**, because a link someone pasted should
still show results.

## 4.4 `lib/token.js` — the wristband

```js
export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, { expiresIn: '7d' });
}
```

**The single most likely trap question:**

> **Q: Is the token encrypted?**
> **"No. It's *signed*, not encrypted."** Anyone can paste a JWT into
> jwt.io and read the contents. What they *cannot* do is change it, because the
> signature would stop matching the server's secret. That's exactly why the
> token carries only an id and a role — nothing private is in there.

## 4.5 `lib/availability.js` — the brain

The most important file in the project. No database, no Express — just logic.

### Overlap detection

```js
export function overlaps(a, b) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}
```

Two bookings clash if each begins before the other ends.

> **Q: Why `<` and not `<=`?**
> "The windows are **half-open** — `[start, end)`. The end instant belongs to
> the next booking. So a table freed at 20:00 can be rebooked at 20:00. With
> `<=` the table would sit dead for a slot and the restaurant loses a cover
> every turn."

```
A:  18:30 ────────── 20:00
B:                   20:00 ────────── 21:30
                       ↑ not a clash
```

### Choosing the table

```js
return tables
  .filter((t) => t.seats >= partySize)                 // big enough
  .filter((t) => isTableFree(t, window, reservations)) // actually free
  .sort((a, b) => a.seats - b.seats || ...);           // smallest first
```

> **Q: Why the smallest table that fits?**
> "Greedy best-fit. If a party of two takes the six-seater, a party of six later
> can't be seated at all. **Be honest that it's greedy, not optimal** — a
> globally optimal plan is bin-packing. Knowing your solution's limit is a
> strength."

---

# PART 5 — `routes/`, the waiter

Routes are deliberately **thin**. They read the request, call a service, send
the reply. No business logic.

## 5.1 `routes/auth.routes.js` (33 lines)

`POST /register`, `POST /login`, `GET /me`. Each one is four lines.

## 5.2 `routes/restaurant.routes.js` — public browsing

`GET /` (search), `GET /filters`, `GET /:identifier`, `GET /:identifier/availability`.

`:identifier` accepts a **slug or an id**, which is why URLs read
`/restaurants/sakura-lane` rather than `/restaurants/cms7p4ej5000n...`.

## 5.3 `routes/reservation.routes.js` — diner bookings

Create, list your own, modify, cancel. All behind `authenticate`.

## 5.4 `routes/manager.routes.js` — the important one

```js
managerRoutes.use(authenticate, authorize(ROLES.MANAGER));
```

**One line protecting every route in the file.** Not signed in → 401.
Signed in but a diner → 403.

Read the comment at the top of the file out loud in your demo:

> "Two gates apply to everything here: `authorize(MANAGER)` checks the role, and
> each service call additionally verifies the venue belongs to this manager.
> **The role check alone would let any manager read every other venue's
> bookings.**"

That sentence is the whole ownership argument in one line.

---

# PART 6 — `services/`, the chef

The only layer allowed to touch Prisma.

## 6.1 `services/auth.service.js`

### Register

Validate → normalise the email to lowercase → check it's not taken → **hash the
password** → create → return a token.

```js
passwordHash: await bcrypt.hash(password, config.bcryptRounds),
```

> **Q: Why bcrypt and not SHA-256?**
> "Bcrypt is deliberately *slow* and *salted*. Slow makes brute force expensive.
> Salted means two people with the same password get different hashes, so
> cracking one doesn't crack the other. A fast hash like SHA-256 is the wrong
> tool for passwords precisely because it's fast."

### Login — the cleverest ten lines in the project

```js
const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalid...';
const passwordMatches = await bcrypt.compare(password, hash);
if (!user || !passwordMatches) throw unauthorized('Email or password is incorrect.');
```

Two defences at once:

1. **One message for both failures.** Not "no such user" vs "wrong password" —
   both say the same thing. Otherwise the endpoint becomes a tool for
   discovering which emails are registered (**account enumeration**).

2. **The dummy hash.** If there's no such user, it *still* runs a bcrypt
   comparison against a fake hash. Why? Bcrypt is slow. If it skipped the
   comparison for unknown emails, unknown emails would answer noticeably faster —
   and an attacker could tell real accounts from fake ones **by timing alone**.
   This is a **timing attack**, and the dummy hash closes it.

> Volunteer this one. Very few students defend against timing attacks.

## 6.2 `services/reservation.service.js` — the booking

```js
return prisma.$transaction(async (tx) => {
  const window = { startsAt, endsAt: endOfSitting(startsAt, restaurant.seatingMinutes) };
  const reservations = await loadClashing(tx, restaurant.id, window);   // ① re-read INSIDE
  const result = evaluateBooking({ ... });                              // ② pure decision
  if (!result.ok) throw rejectionToError(result);
  return tx.reservation.create({ ... });                                // ③ write
});
```

**The race condition — expect this question.**

> **Q: Two people book the last table at the same instant. What happens?**
>
> "Checking availability and writing the booking must be one atomic unit. If I
> checked *outside* the transaction, both requests could see the table free,
> both pass, and both write — a double booking.
>
> Re-reading the clashing bookings **inside** the transaction closes that
> window. One commits; the other sees the new row and is rejected with 409.
>
> And I don't just claim it — `server/test/api.test.js:245` fires two concurrent
> bookings with `Promise.all` and asserts exactly one 201 and one 409."

Note `loadClashing` only fetches bookings that **could** clash:

```js
where: { restaurantId, status: { in: BLOCKING_STATUSES },
         startsAt: { lt: window.endsAt }, endsAt: { gt: window.startsAt } }
```

That's the `overlaps` rule pushed down into SQL, so the database filters instead
of loading thousands of rows into memory.

## 6.3 `services/restaurant.service.js` — search, and ownership

```js
export async function assertOwnsRestaurant(restaurantId, managerId) {
  const restaurant = await prisma.restaurant.findUnique({ ... });
  if (!restaurant || restaurant.managerId !== managerId) {
    throw notFound('That restaurant does not exist.');   // ← 404, NOT 403
  }
}
```

**Volunteer this — it's your strongest security point.**

> "If manager A asks for manager B's restaurant, the API answers **404 Not
> Found**, not 403 Forbidden. 403 would confirm the record exists — an
> information leak. Someone could enumerate valid ids by watching which return
> 403 and which return 404. Answering 404 for 'exists but isn't yours' means the
> API never confirms the existence of anything the caller isn't entitled to see.
> That's OWASP A01, Broken Access Control."

## 6.4 `services/stats.service.js` — the dashboard numbers

Covers today, occupancy, cancellation and no-show rates, a daily series, and
busiest hours.

**Occupancy** = table-hours booked ÷ table-hours available. That's why the
dashboard needs `tableCount` and opening hours, not just a booking count.

---

# PART 7 — The database

## 7.1 `prisma/schema.prisma`

Four models:

```
User ─┬─ manages ──→ Restaurant ──→ Table
      └─ books ────→ Reservation ←─┘
```

Three things to point at:

**Indexes:**
```prisma
@@index([tableId, startsAt, endsAt])
```
Every availability query filters on exactly those three columns, so the index
matches the query shape.

**Cascade deletes:** delete a restaurant and its tables and reservations go with
it — no orphaned rows pointing at nothing.

**The SQLite compromises, documented at the top of the file:** no `enum` type,
so `role` and `status` are strings validated against `lib/constants.js`;
`openingHours` is a JSON string parsed in the service layer. Both keep the
schema portable to PostgreSQL without a rewrite.

## 7.2 `prisma/seed.js` — the demo data

Generates 6 venues and ~4,400 reservations across 28 days behind and 14 ahead.

Two details worth knowing, because they're the kind of thing a marker probes:

**Capacity is `tables × turns`, not `tables × sittings`.** A sitting occupies a
table for 90 minutes, which spans several 30-minute slots. Multiplying by
sittings would oversubscribe the venue and leave diners with nothing bookable.

**The generator records everything it places as CONFIRMED**, even rows written
as `COMPLETED`. Why: the engine treats `COMPLETED` as having released the table
— correct for a live booking, wrong when *building a history*, because it would
let two completed sittings sit on one table at one time. That's a real bug that
was in the data and got fixed.

---

# PART 8 — One request, all the way through

A diner clicks **Book** at 19:30:

```
 1. Browser      POST /api/reservations  + Bearer token      client/src/lib/api.js
 2. requestId    tags it                                     middleware/logging.js
 3. helmet/cors  security headers                            app.js
 4. writeLimiter 30/min?                                     middleware/security.js
 5. json parser  reads the body (100 kb max)                 app.js
 6. authenticate token → user, loaded from the DB            middleware/auth.js
 7. route        validates, calls the service                routes/reservation.routes.js
 8. service      TRANSACTION: re-read → decide → write       services/reservation.service.js
 9. engine       overlaps() + smallest free table            lib/availability.js
10. response     201 Created  (or 409 + nearby times)
11. errorHandler only if anything above threw                middleware/error.js
```

**If you can narrate those eleven steps, you can pass the viva.**

---

## Final cheat sheet

| They ask | You say |
|---|---|
| Why layers? | One reason to change each. Routes ≠ rules ≠ tools. |
| Why `<` not `<=`? | Half-open intervals; a table freed at 20:00 rebooks at 20:00. |
| Double booking? | Check and write in one transaction, clash query re-read inside it. |
| Is the JWT encrypted? | **No — signed.** Readable, not forgeable. |
| Why 404 not 403? | 403 confirms the record exists. OWASP A01. |
| Why bcrypt? | Slow and salted, on purpose. |
| Why the dummy hash on login? | Defeats a timing attack that would reveal real accounts. |
| Why SQLite? | One file, clones and runs anywhere. Schema is Postgres-portable. |
| SQL injection? | Prisma parameterises everything; no string-built SQL. |
| Weakest part? | Greedy allocation; `db push` not versioned migrations; 975 kB 3D bundle. |

**If you don't know, say "I don't know — I'd look at X."** Markers prefer that
to invention every time, and they can always tell.
