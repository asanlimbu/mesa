/**
 * Input validation helpers.
 *
 * Pure functions over plain values, like the availability engine, so they are
 * testable without a request object. Each returns either a cleaned value or a
 * field-keyed error map that the controller turns into a 400.
 */

import {
  PRICE_BAND_MIN,
  PRICE_BAND_MAX,
  SORT_OPTIONS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

/**
 * Password rules, kept deliberately modest: length is the property that
 * actually resists brute force, and complexity rules mostly push people towards
 * predictable substitutions.
 */
export function passwordProblem(value) {
  if (typeof value !== 'string' || value.length === 0) return 'Password is required.';
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (value.length > 200) return 'Password must be under 200 characters.';
  return null;
}

/**
 * Collect validation errors into a field map. Returns null when everything
 * passes, so callers can write `if (errors) throw validationFailed(errors)`.
 */
export function collect(checks) {
  const errors = {};
  for (const [field, problem] of Object.entries(checks)) {
    if (problem) errors[field] = problem;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

export function validateRegistration({ name, email, password, role }) {
  return collect({
    name:
      typeof name !== 'string' || name.trim().length < 2
        ? 'Name must be at least 2 characters.'
        : null,
    email: isValidEmail(email) ? null : 'Enter a valid email address.',
    password: passwordProblem(password),
    role:
      role !== undefined && role !== 'DINER' && role !== 'MANAGER'
        ? 'Role must be DINER or MANAGER.'
        : null,
  });
}

export function validateLogin({ email, password }) {
  return collect({
    email: isValidEmail(email) ? null : 'Enter a valid email address.',
    password: !password ? 'Password is required.' : null,
  });
}

/**
 * Parse a date-time from the client.
 *
 * Accepts a full ISO string, or a `date` + `time` pair from separate form
 * inputs. Returns null when the result is not a real date.
 */
export function parseDateTime({ isoString, date, time }) {
  const raw = isoString ?? (date && time ? `${date}T${time}` : null);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Coerce a query parameter that may arrive once or repeated into an array. */
export function toArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Normalise restaurant search query parameters into a clean, bounded object.
 *
 * Unknown sort values fall back to the default rather than erroring — a bad
 * `sort` in a shared URL should still return results.
 */
export function parseRestaurantQuery(query = {}) {
  const priceBands = toArray(query.priceBand)
    .map(Number)
    .filter(
      (band) =>
        Number.isInteger(band) && band >= PRICE_BAND_MIN && band <= PRICE_BAND_MAX,
    );

  const partySizeRaw = Number(query.partySize);
  const partySize = Number.isInteger(partySizeRaw) && partySizeRaw > 0 ? partySizeRaw : null;

  const pageRaw = Number(query.page);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const pageSizeRaw = Number(query.pageSize);
  const pageSize =
    Number.isInteger(pageSizeRaw) && pageSizeRaw > 0
      ? Math.min(pageSizeRaw, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    q: typeof query.q === 'string' && query.q.trim() ? query.q.trim() : null,
    cuisines: toArray(query.cuisine).filter((value) => typeof value === 'string'),
    city: typeof query.city === 'string' && query.city.trim() ? query.city.trim() : null,
    priceBands,
    partySize,
    date: typeof query.date === 'string' ? query.date : null,
    time: typeof query.time === 'string' ? query.time : null,
    sort: SORT_OPTIONS.includes(query.sort) ? query.sort : 'rating',
    page,
    pageSize,
  };
}
