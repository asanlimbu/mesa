/**
 * Thin fetch wrapper around the Mesa API.
 *
 * Every call goes through here so the token header, JSON handling and error
 * shape are defined once rather than in each component.
 */

const TOKEN_KEY = 'mesa.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * An API rejection, carrying the server's machine-readable code so callers can
 * branch on it (notably TABLE_UNAVAILABLE, which arrives with alternatives).
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is the API running?');
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(
      response.status,
      error.code ?? 'UNKNOWN',
      error.message ?? 'Something went wrong.',
      error.details,
    );
  }

  return payload;
}

/** Build a query string, dropping empty values and expanding arrays. */
function query(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.append(key, value);
  }

  const string = search.toString();
  return string ? `?${string}` : '';
}

export const api = {
  auth: {
    register: (body) => request('/auth/register', { method: 'POST', body }),
    login: (body) => request('/auth/login', { method: 'POST', body }),
    me: (signal) => request('/auth/me', { signal }),
  },

  restaurants: {
    search: (params, signal) => request(`/restaurants${query(params)}`, { signal }),
    filters: (signal) => request('/restaurants/filters', { signal }),
    get: (identifier, signal) => request(`/restaurants/${identifier}`, { signal }),
    availability: (identifier, params, signal) =>
      request(`/restaurants/${identifier}/availability${query(params)}`, { signal }),
  },

  reservations: {
    create: (body) => request('/reservations', { method: 'POST', body }),
    mine: (signal) => request('/reservations/mine', { signal }),
    get: (id, signal) => request(`/reservations/${id}`, { signal }),
    update: (id, body) => request(`/reservations/${id}`, { method: 'PATCH', body }),
    cancel: (id) => request(`/reservations/${id}`, { method: 'DELETE' }),
  },

  manager: {
    restaurant: (signal) => request('/manager/restaurant', { signal }),
    reservations: (params, signal) =>
      request(`/manager/reservations${query(params)}`, { signal }),
    setStatus: (id, status) =>
      request(`/manager/reservations/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    stats: (params, signal) => request(`/manager/stats${query(params)}`, { signal }),
  },
};
