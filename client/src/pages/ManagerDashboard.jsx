/**
 * Manager dashboard: metrics and the reservation queue.
 *
 * Everything here is scoped to the manager's own venue by the server; the
 * client never asks for a restaurant id.
 */

import { useEffect, useState } from 'react';

import { api } from '../lib/api.js';
import { useToast } from '../state/toast.jsx';
import { percentOf, timeOf, dateOf, longDateOf, today } from '../lib/format.js';
import { TrendChart, HourBars, StatTile } from '../components/charts.jsx';
import {
  Button,
  Eyebrow,
  EmptyState,
  ErrorNote,
  Spinner,
  StatusPill,
} from '../components/ui.jsx';

const QUEUE_ACTIONS = [
  { status: 'SEATED', label: 'Seat' },
  { status: 'COMPLETED', label: 'Complete' },
  { status: 'NO_SHOW', label: 'No-show' },
  { status: 'CANCELLED', label: 'Cancel' },
];

function QueueRow({ reservation, onSetStatus, busy }) {
  return (
    <tr className="border-b border-sage/10 last:border-0">
      <td className="py-3 pr-4 font-mono text-sm text-linen whitespace-nowrap tabular-nums">
        {timeOf(reservation.startsAt)}
      </td>
      <td className="py-3 pr-4 text-sm text-linen">
        {reservation.user.name}
        {reservation.notes && (
          <span className="mt-0.5 block text-xs text-sage-dim italic">
            {reservation.notes}
          </span>
        )}
      </td>
      <td className="py-3 pr-4 font-mono text-sm text-sage tabular-nums">
        {reservation.partySize}
      </td>
      <td className="py-3 pr-4 font-mono text-sm text-sage">
        {reservation.table.label}
      </td>
      <td className="py-3 pr-4">
        <StatusPill status={reservation.status} />
      </td>
      <td className="py-3">
        <div className="flex flex-wrap justify-end gap-1.5">
          {QUEUE_ACTIONS.filter((action) => action.status !== reservation.status).map(
            (action) => (
              <button
                key={action.status}
                type="button"
                disabled={busy}
                onClick={() => onSetStatus(reservation, action.status)}
                className="rounded border border-sage/25 px-2 py-1 text-[11px] text-sage transition hover:border-brass hover:text-brass disabled:opacity-40"
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      </td>
    </tr>
  );
}

export function ManagerDashboard() {
  const { notify, warn } = useToast();

  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [day, setDay] = useState(today());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    api.manager
      .stats({ days: 30 }, controller.signal)
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((requestError) => {
        // On abort a newer request owns the state. Clearing `loading` here
        // would drop the component past its guard clauses while `stats` is
        // still null, and the render reads stats.restaurant.
        if (requestError.name === 'AbortError') return;
        setError(requestError.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const loadQueue = () => {
    const controller = new AbortController();

    api.manager
      .reservations(
        { from: `${day}T00:00:00`, to: `${day}T23:59:59` },
        controller.signal,
      )
      .then(setQueue)
      .catch(() => {});

    return () => controller.abort();
  };

  useEffect(loadQueue, [day]);

  async function handleSetStatus(reservation, status) {
    setBusyId(reservation.id);
    try {
      await api.manager.setStatus(reservation.id, status);
      notify(`${reservation.user.name} marked ${status.toLowerCase().replace('_', ' ')}.`);
      loadQueue();
    } catch (requestError) {
      warn(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Spinner label="Loading your dashboard" />;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20">
        <ErrorNote>{error}</ErrorNote>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-mono text-[11px] tracking-[0.2em] text-brass uppercase">
        Manager dashboard
      </p>
      <h1 className="font-display mt-2 text-4xl text-linen sm:text-5xl">
        {stats.restaurant.name}
      </h1>
      <p className="mt-2 text-sage">
        {stats.tableCount} tables · {stats.seatCount} covers · last {stats.windowDays} days
      </p>

      {/* Headline numbers */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Covers today"
          value={stats.today.covers}
          detail={`${stats.today.bookings} bookings`}
          tone="brass"
        />
        <StatTile
          label="Upcoming"
          value={stats.upcoming.bookings}
          detail={`${stats.upcoming.covers} covers booked`}
        />
        <StatTile
          label="Occupancy"
          value={percentOf(stats.occupancyRate)}
          detail="of available table hours"
        />
        <StatTile
          label="No-shows"
          value={percentOf(stats.noShowRate)}
          detail={`${percentOf(stats.cancellationRate)} cancelled`}
          tone={stats.noShowRate > 0.1 ? 'oxblood' : 'linen'}
        />
      </div>

      {/* Charts */}
      <div className="mt-12 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <Eyebrow>Bookings, last 30 days</Eyebrow>
          <div className="mt-5">
            <TrendChart series={stats.series} />
          </div>
        </section>

        <section>
          <Eyebrow>When you are busy</Eyebrow>
          <div className="mt-5">
            <HourBars hours={stats.busiestHours} />
          </div>
        </section>
      </div>

      {/* Service queue */}
      <section className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex-1">
            <Eyebrow>Service sheet</Eyebrow>
          </div>

          <label className="flex items-center gap-2 text-xs text-sage">
            Day
            <input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="rounded-plate border border-sage/25 bg-ink-deep/60 px-2.5 py-1.5 text-xs text-linen focus:border-brass focus:outline-none"
            />
          </label>
        </div>

        <p className="mt-3 text-sm text-sage">
          {longDateOf(`${day}T12:00:00`)} — {queue.length}{' '}
          {queue.length === 1 ? 'booking' : 'bookings'}
        </p>

        <div className="mt-5 overflow-x-auto">
          {queue.length === 0 ? (
            <EmptyState title="Nothing booked">
              No reservations for this day yet.
            </EmptyState>
          ) : (
            <table className="w-full min-w-2xl border-collapse text-left">
              <thead>
                <tr className="border-b border-sage/25">
                  {['Time', 'Guest', 'Party', 'Table', 'Status', ''].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="pb-2.5 font-mono text-[10px] tracking-[0.14em] text-sage uppercase last:text-right"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((reservation) => (
                  <QueueRow
                    key={reservation.id}
                    reservation={reservation}
                    onSetStatus={handleSetStatus}
                    busy={busyId === reservation.id}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
