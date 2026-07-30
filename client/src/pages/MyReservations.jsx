/**
 * A diner's own bookings, split into upcoming and past.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../lib/api.js';
import { useToast } from '../state/toast.jsx';
import { stampOf, relativeDayOf, longDateOf, timeOf } from '../lib/format.js';
import {
  Button,
  Eyebrow,
  EmptyState,
  ErrorNote,
  Reveal,
  Spinner,
  StatusPill,
} from '../components/ui.jsx';

function ReservationCard({ reservation, onCancel, cancelling }) {
  const cancellable =
    ['PENDING', 'CONFIRMED'].includes(reservation.status) &&
    new Date(reservation.startsAt) > new Date();

  return (
    <div className="flex flex-col gap-4 rounded-plate border border-sage/20 bg-banquette/40 p-5 sm:flex-row sm:items-center">
      <img
        src={reservation.restaurant.heroImage}
        alt=""
        loading="lazy"
        className="h-20 w-full rounded-lg object-cover sm:w-28"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={`/restaurants/${reservation.restaurant.slug}`}
            className="font-display text-xl text-linen transition-colors hover:text-brass"
          >
            {reservation.restaurant.name}
          </Link>
          <StatusPill status={reservation.status} />
        </div>

        <p className="mt-1 text-sm text-sage">
          {stampOf(reservation.startsAt)} · {reservation.partySize}{' '}
          {reservation.partySize === 1 ? 'guest' : 'guests'} · table{' '}
          <span className="font-mono">{reservation.table.label}</span>
        </p>

        <p className="mt-1 font-mono text-[11px] tracking-[0.1em] text-sage-dim uppercase">
          {relativeDayOf(reservation.startsAt)} · {reservation.restaurant.city}
        </p>

        {reservation.notes && (
          <p className="mt-2 text-xs text-sage-dim italic">“{reservation.notes}”</p>
        )}
      </div>

      {cancellable && (
        <Button
          tone="danger"
          busy={cancelling}
          onClick={() => onCancel(reservation)}
          className="shrink-0"
        >
          Cancel booking
        </Button>
      )}
    </div>
  );
}

export function MyReservations() {
  const { notify, warn } = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const load = () => {
    const controller = new AbortController();

    api.reservations
      .mine(controller.signal)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        setError(requestError.message);
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(load, []);

  async function handleCancel(reservation) {
    setCancellingId(reservation.id);
    try {
      await api.reservations.cancel(reservation.id);
      notify('Booking cancelled.');
      load();
    } catch (requestError) {
      warn(requestError.message);
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) return <Spinner label="Loading your bookings" />;

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="font-display text-4xl text-linen sm:text-5xl">My bookings</h1>

      {error && <ErrorNote className="mt-6">{error}</ErrorNote>}

      <section className="mt-12">
        <Eyebrow>Upcoming</Eyebrow>

        <div className="mt-6 space-y-4">
          {data?.upcoming.length === 0 ? (
            <EmptyState
              title="No tables booked"
              action={
                <Button>
                  <Link to="/restaurants">Find a restaurant</Link>
                </Button>
              }
            >
              When you book a table it will appear here, with the time and your
              table number.
            </EmptyState>
          ) : (
            data?.upcoming.map((reservation, index) => (
              <Reveal key={reservation.id} delay={index * 0.06}>
                <ReservationCard
                  reservation={reservation}
                  onCancel={handleCancel}
                  cancelling={cancellingId === reservation.id}
                />
              </Reveal>
            ))
          )}
        </div>
      </section>

      {data?.past.length > 0 && (
        <section className="mt-16">
          <Eyebrow>Past</Eyebrow>

          <div className="mt-6 space-y-4 opacity-75">
            {data.past.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
