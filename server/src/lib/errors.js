/**
 * One error type for everything the API deliberately rejects.
 *
 * Services throw these; a single Express error middleware serialises them.
 * Anything that is *not* an AppError is an unexpected failure and becomes a
 * generic 500 — internal detail never reaches the client.
 */

export class AppError extends Error {
  /**
   * @param {number} status - HTTP status code
   * @param {string} code - stable, machine-readable identifier for the client
   * @param {string} message - human-readable explanation
   * @param {object} [details] - extra context, e.g. per-field validation errors
   */
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const badRequest = (message, details) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const validationFailed = (fieldErrors) =>
  new AppError(400, 'VALIDATION_FAILED', 'Some fields need attention.', {
    fields: fieldErrors,
  });

export const unauthorized = (message = 'Authentication required.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Not found.') =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (code, message, details) =>
  new AppError(409, code, message, details);
