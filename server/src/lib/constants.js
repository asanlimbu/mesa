/**
 * Shared domain constants.
 *
 * SQLite cannot express enums through Prisma, so these values are the single
 * source of truth for what the string columns are allowed to contain.
 */

export const ROLES = Object.freeze({
  DINER: 'DINER',
  MANAGER: 'MANAGER',
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));

export const RESERVATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SEATED: 'SEATED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
});

export const ALL_STATUSES = Object.freeze(Object.values(RESERVATION_STATUS));

/**
 * Statuses that still occupy a table. Anything outside this set has released
 * its table and must be ignored by conflict detection.
 */
export const BLOCKING_STATUSES = Object.freeze([
  RESERVATION_STATUS.PENDING,
  RESERVATION_STATUS.CONFIRMED,
  RESERVATION_STATUS.SEATED,
]);

/** Statuses a manager is allowed to move a reservation into. */
export const MANAGER_SETTABLE_STATUSES = Object.freeze([
  RESERVATION_STATUS.CONFIRMED,
  RESERVATION_STATUS.SEATED,
  RESERVATION_STATUS.COMPLETED,
  RESERVATION_STATUS.CANCELLED,
  RESERVATION_STATUS.NO_SHOW,
]);

/** Weekday keys used by Restaurant.openingHours, indexed to match Date#getDay(). */
export const WEEKDAYS = Object.freeze([
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
]);

export const PARTY_SIZE_MIN = 1;
export const PARTY_SIZE_MAX = 20;

/** How long before the sitting a diner may still cancel, in minutes. */
export const CANCELLATION_WINDOW_MINUTES = 120;

export const PRICE_BAND_MIN = 1;
export const PRICE_BAND_MAX = 4;

export const SORT_OPTIONS = Object.freeze([
  'name',
  'price_asc',
  'price_desc',
  'rating',
]);

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
