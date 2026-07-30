/**
 * Display formatting.
 *
 * The API speaks UTC ISO strings; every one of these renders in the viewer's
 * local time, which is what a diner expects to read.
 */

const LOCALE = 'en-GB';

export const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

export const dateOf = (iso) =>
  new Date(iso).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

export const longDateOf = (iso) =>
  new Date(iso).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/** "Fri 7 Aug, 19:30" — the form used on reservation cards. */
export const stampOf = (iso) => `${dateOf(iso)}, ${timeOf(iso)}`;

/** YYYY-MM-DD in local time, for date inputs and API params. */
export function toDateInput(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export const today = () => toDateInput(new Date());

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

/** £ to ££££ — the notation diners already read on listings. */
export const priceBandOf = (band) => '£'.repeat(Math.max(1, Math.min(4, band)));

export const percentOf = (ratio) => `${Math.round(ratio * 100)}%`;

/** "in 3 days" / "tomorrow" / "today" — relative, for upcoming bookings. */
export function relativeDayOf(iso) {
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const days = Math.round((target - now) / 86_400_000);

  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 1) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

export const STATUS_COPY = {
  PENDING: { label: 'Pending', tone: 'sage' },
  CONFIRMED: { label: 'Confirmed', tone: 'brass' },
  SEATED: { label: 'Seated', tone: 'brass' },
  COMPLETED: { label: 'Completed', tone: 'sage' },
  CANCELLED: { label: 'Cancelled', tone: 'oxblood' },
  NO_SHOW: { label: 'No-show', tone: 'oxblood' },
};
