/**
 * Restaurant detail and booking.
 *
 * The floor plan is the booking interface here: choosing a sitting repaints it
 * with what is free, and confirming shows which table the engine allocated.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';

import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../state/auth.jsx';
import { useToast } from '../state/toast.jsx';
import {
  priceBandOf,
  timeOf,
  today,
  addDays,
  longDateOf,
  stampOf,
} from '../lib/format.js';
import { FloorPlan, TablePlanKey } from '../components/FloorPlan.jsx';
import {
  Button,
  Eyebrow,
  ErrorNote,
  SelectField,
  Spinner,
  TextField,
} from '../components/ui.jsx';

const DAY_LABELS = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function OpeningHours({ hours }) {
  return (
    <dl className="space-y-1.5">
      {DAY_ORDER.map((key) => (
        <div key={key} className="flex justify-between gap-4 text-sm">
          <dt className="text-sage">{DAY_LABELS[key]}</dt>
          <dd className="font-mono text-xs text-linen tabular-nums">
            {hours[key] ? `${hours[key].open}–${hours[key].close}` : 'Closed'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Sitting times for the chosen day.
 *
 * A sitting that has passed and a sitting that is fully booked are both
 * unselectable but they are not the same thing, so they do not look the same:
 * past times simply fade out, booked times are struck through.
 */
function TimePicker({ slots, value, onChange }) {
  if (slots.length === 0) return null;

  const bookable = slots.filter((slot) => !slot.past);

  if (bookable.length === 0) {
    return (
      <p className="text-sm text-sage">
        No sittings left today. Try tomorrow.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {bookable.map((slot) => {
        const selected = slot.startsAt === value;

        return (
          <button
            key={slot.startsAt}
            type="button"
            disabled={!slot.available}
            aria-pressed={selected}
            aria-label={`${timeOf(slot.startsAt)}${slot.available ? '' : ', fully booked'}`}
            onClick={() => onChange(slot.startsAt)}
            className={`rounded-plate border px-3 py-1.5 font-mono text-xs tabular-nums transition ${
              selected
                ? 'border-brass bg-brass text-ink'
                : slot.available
                  ? 'border-sage/30 text-linen hover:border-brass hover:text-brass'
                  : 'cursor-not-allowed border-sage/10 text-sage-dim/50 line-through'
            }`}
          >
            {timeOf(slot.startsAt)}
          </button>
        );
      })}
    </div>
  );
}

export function RestaurantDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isSignedIn, isManager } = useAuth();
  const { notify, warn } = useToast();

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(today());
  const [partySize, setPartySize] = useState(2);
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);

  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    api.restaurants
      .get(slug, controller.signal)
      .then((data) => {
        setRestaurant(data);
        setLoading(false);
      })
      .catch((requestError) => {
        // An aborted request must not clear `loading`, or the component falls
        // through to its "restaurant not found" branch while the real request
        // is still in flight.
        if (requestError.name === 'AbortError') return;
        setError(requestError.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [slug]);

  // Re-check availability whenever the sitting changes.
  useEffect(() => {
    if (!restaurant) return;

    const controller = new AbortController();
    setChecking(true);
    setSelected(null);

    api.restaurants
      .availability(slug, { date, partySize }, controller.signal)
      .then(setAvailability)
      .catch(() => {})
      .finally(() => setChecking(false));

    return () => controller.abort();
  }, [restaurant, slug, date, partySize]);

  /**
   * The selected sitting, as the server reported it.
   *
   * The free tables and the allocated table both come from the API rather than
   * being inferred here: the client cannot see which tables are already booked,
   * so any local guess would eventually name a different table from the one the
   * booking actually gets.
   */
  const slot = useMemo(
    () =>
      selected && availability
        ? availability.slots.find((entry) => entry.startsAt === selected)
        : null,
    [availability, selected],
  );

  const freeTableIds = slot ? slot.freeTableIds : null;
  const allocatedTableId = slot?.tableId ?? null;
  const allocatedTable = restaurant?.tables.find((t) => t.id === allocatedTableId);

  async function handleBook(event) {
    event.preventDefault();
    setError(null);
    setAlternatives([]);

    if (!isSignedIn) {
      navigate('/sign-in', { state: { from: `/restaurants/${slug}` } });
      return;
    }

    setBooking(true);
    try {
      const reservation = await api.reservations.create({
        restaurantId: restaurant.id,
        startsAt: selected,
        partySize,
        notes,
      });

      setConfirmed(reservation);
      notify(`Table booked at ${restaurant.name}.`);
    } catch (requestError) {
      setError(requestError.message);

      if (requestError instanceof ApiError && requestError.code === 'TABLE_UNAVAILABLE') {
        setAlternatives(requestError.details?.alternatives ?? []);
        warn('That table went while you were deciding.');
      }

      // The room has changed underneath us, so repaint it.
      api.restaurants
        .availability(slug, { date, partySize })
        .then(setAvailability)
        .catch(() => {});
    } finally {
      setBooking(false);
    }
  }

  if (loading) return <Spinner label="Loading restaurant" />;

  if (!restaurant) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="font-display text-3xl text-linen">Restaurant not found</h1>
        <p className="mt-2 text-sage">{error ?? 'That restaurant does not exist.'}</p>
        <Button className="mt-6" onClick={() => navigate('/restaurants')}>
          Browse restaurants
        </Button>
      </div>
    );
  }

  return (
    <article>
      {/* Hero */}
      <div className="relative h-[42vh] min-h-72 overflow-hidden">
        <img
          src={restaurant.heroImage}
          alt=""
          className="h-full w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/10"
        />

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-5 pb-8">
            <p className="font-mono text-[11px] tracking-[0.2em] text-brass uppercase">
              {restaurant.cuisine} · {restaurant.city} · {priceBandOf(restaurant.priceBand)}
            </p>
            <h1 className="font-display mt-2 text-4xl text-linen sm:text-6xl">
              {restaurant.name}
            </h1>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-12 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="max-w-2xl text-lg leading-relaxed text-sage">
            {restaurant.description}
          </p>

          <div className="mt-10">
            <Eyebrow>The room</Eyebrow>
            <p className="mt-4 max-w-xl text-sm text-sage">
              {restaurant.tables.length} tables, {restaurant.tables.reduce((sum, t) => sum + t.seats, 0)}{' '}
              covers. Choose a sitting to see what is free.
            </p>

            <FloorPlan
              tables={restaurant.tables}
              freeTableIds={freeTableIds}
              allocatedTableId={allocatedTableId}
              height={440}
              className="mt-4"
            />
            <TablePlanKey className="justify-center" />
          </div>

          <div className="mt-14 grid gap-10 sm:grid-cols-2">
            <div>
              <Eyebrow>Opening hours</Eyebrow>
              <div className="mt-4">
                <OpeningHours hours={restaurant.openingHours} />
              </div>
            </div>

            <div>
              <Eyebrow>Find us</Eyebrow>
              <address className="mt-4 text-sm leading-relaxed text-sage not-italic">
                {restaurant.addressLine}
                <br />
                {restaurant.city}
                <br />
                <span className="font-mono text-xs">{restaurant.postcode}</span>
              </address>
              <p className="mt-4 font-mono text-xs text-sage-dim">
                Sittings last {restaurant.seatingMinutes} minutes.
              </p>
            </div>
          </div>
        </div>

        {/* Booking panel */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <>
            {confirmed ? (
              <div className="rise rounded-plate border border-brass/40 bg-banquette/60 p-6">
                <p className="font-mono text-[11px] tracking-[0.18em] text-brass uppercase">
                  Booking confirmed
                </p>
                <h2 className="font-display mt-3 text-2xl text-linen">
                  Table {confirmed.table.label}
                </h2>
                <p className="mt-2 text-sm text-sage">
                  {stampOf(confirmed.startsAt)} · {confirmed.partySize}{' '}
                  {confirmed.partySize === 1 ? 'guest' : 'guests'}
                </p>

                <div className="mt-6 flex flex-col gap-2">
                  <Button onClick={() => navigate('/reservations')}>
                    View my bookings
                  </Button>
                  <Button
                    tone="ghost"
                    onClick={() => {
                      setConfirmed(null);
                      setSelected(null);
                      setNotes('');
                    }}
                  >
                    Book another table
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleBook}
                className="rounded-plate border border-sage/25 bg-banquette/45 p-6"
              >
                <h2 className="font-display text-2xl text-linen">Book a table</h2>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <TextField
                    label="Date"
                    type="date"
                    value={date}
                    min={today()}
                    max={addDays(today(), 90)}
                    onChange={(event) => setDate(event.target.value)}
                  />
                  <SelectField
                    label="Party"
                    value={partySize}
                    onChange={(event) => setPartySize(Number(event.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((size) => (
                      <option key={size} value={size} className="bg-ink">
                        {size}
                      </option>
                    ))}
                  </SelectField>
                </div>

                <div className="mt-5">
                  <p className="mb-2.5 font-mono text-[11px] tracking-[0.14em] text-sage uppercase">
                    Sitting
                  </p>

                  {checking && <p className="text-xs text-sage-dim">Checking the room…</p>}

                  {!checking && availability?.closed && (
                    <p className="text-sm text-sage">
                      Closed on {longDateOf(`${date}T12:00:00`)}.
                    </p>
                  )}

                  {!checking && availability && !availability.closed && (
                    <TimePicker
                      slots={availability.slots}
                      value={selected}
                      onChange={setSelected}
                    />
                  )}
                </div>

                {selected && allocatedTable && (
                  <p className="mt-4 rounded-plate border border-brass/25 bg-brass/8 px-3 py-2 text-xs text-brass">
                    You will be seated at table {allocatedTable.label} ({allocatedTable.seats}{' '}
                    seats).
                  </p>
                )}

                <TextField
                  label="Anything we should know"
                  className="mt-5"
                  placeholder="Allergies, occasion, access needs"
                  value={notes}
                  maxLength={200}
                  onChange={(event) => setNotes(event.target.value)}
                />

                {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

                {alternatives.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-sage">Still free nearby:</p>
                    <div className="flex flex-wrap gap-2">
                      {alternatives.map((alternative) => (
                        <button
                          key={alternative}
                          type="button"
                          onClick={() => {
                            setSelected(alternative);
                            setAlternatives([]);
                            setError(null);
                          }}
                          className="rounded-plate border border-brass/50 px-3 py-1.5 font-mono text-xs text-brass transition hover:bg-brass hover:text-ink"
                        >
                          {timeOf(alternative)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isManager ? (
                  <p className="mt-5 text-xs text-sage-dim">
                    You are signed in as a manager. Switch to a diner account to book.
                  </p>
                ) : (
                  <Button
                    type="submit"
                    busy={booking}
                    disabled={!selected}
                    className="mt-6 w-full"
                  >
                    {isSignedIn ? 'Confirm booking' : 'Sign in to book'}
                  </Button>
                )}

                {!isSignedIn && (
                  <p className="mt-3 text-center text-xs text-sage-dim">
                    No account?{' '}
                    <Link to="/register" className="text-brass hover:underline">
                      Create one
                    </Link>
                  </p>
                )}
              </form>
            )}
          </>
        </aside>
      </div>
    </article>
  );
}
