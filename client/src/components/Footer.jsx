/**
 * Site footer.
 *
 * Carries the wordmark, real navigation, the live service state, and the
 * coursework attribution. The top edge uses the brass-to-copper rule so the
 * page closes on the same accent it opens with.
 */

import { Link } from 'react-router-dom';

import { useAuth } from '../state/auth.jsx';

const COLUMNS = [
  {
    title: 'Book',
    links: [
      { label: 'All restaurants', to: '/restaurants' },
      { label: 'London', to: '/restaurants?city=London' },
      { label: 'Manchester', to: '/restaurants?city=Manchester' },
      { label: 'Edinburgh', to: '/restaurants?city=Edinburgh' },
    ],
  },
  {
    title: 'Cuisines',
    links: [
      { label: 'British', to: '/restaurants?cuisine=British' },
      { label: 'Japanese', to: '/restaurants?cuisine=Japanese' },
      { label: 'Spanish', to: '/restaurants?cuisine=Spanish' },
      { label: 'Vegetarian', to: '/restaurants?cuisine=Vegetarian' },
    ],
  },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-7 w-7 text-brass">
        <rect
          x="6"
          y="10"
          width="20"
          height="11"
          rx="2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect x="9.5" y="21" width="2" height="5" rx="1" fill="currentColor" />
        <rect x="20.5" y="21" width="2" height="5" rx="1" fill="currentColor" />
      </svg>
      <span className="font-display text-foil text-2xl leading-none font-semibold">
        Mesa
      </span>
    </div>
  );
}

export function Footer() {
  const { isSignedIn, isManager } = useAuth();

  return (
    <footer className="relative mt-16 overflow-hidden border-t border-sage/15 bg-ink-deep">
      {/* Brass-to-copper rule along the top edge. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass to-copper/40"
      />
      {/* Warmth pooling under the fold, as if from the room above. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/4 h-64 w-[34rem] rounded-full bg-brass/6 blur-[110px]"
      />

      <div className="relative mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-sage">
              We read the floor plan, not a waiting list. Every time you see is a
              table that is genuinely free.
            </p>

            <p className="mt-6 flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-verdigris uppercase">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-verdigris"
              />
              6 restaurants taking bookings
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-mono text-[11px] tracking-[0.18em] text-brass uppercase">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-sage transition-colors duration-200 hover:text-linen"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Your account">
            <h2 className="font-mono text-[11px] tracking-[0.18em] text-brass uppercase">
              Account
            </h2>
            <ul className="mt-4 space-y-2.5">
              {isSignedIn ? (
                <>
                  {!isManager && (
                    <li>
                      <Link
                        to="/reservations"
                        className="text-sm text-sage transition-colors hover:text-linen"
                      >
                        My bookings
                      </Link>
                    </li>
                  )}
                  {isManager && (
                    <li>
                      <Link
                        to="/manager"
                        className="text-sm text-sage transition-colors hover:text-linen"
                      >
                        Dashboard
                      </Link>
                    </li>
                  )}
                </>
              ) : (
                <>
                  <li>
                    <Link
                      to="/sign-in"
                      className="text-sm text-sage transition-colors hover:text-linen"
                    >
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/register"
                      className="text-sm text-sage transition-colors hover:text-linen"
                    >
                      Create account
                    </Link>
                  </li>
                </>
              )}
              <li>
                <a
                  href="#top"
                  className="text-sm text-sage transition-colors hover:text-linen"
                >
                  Back to top
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-sage/12 pt-6 text-xs text-sage-dim sm:flex-row sm:items-center sm:justify-between">
          <p>
            Mesa — a full-stack coursework project by Asan Limbu. Restaurants,
            bookings and reviews are fictional.
          </p>
          <p className="font-mono tracking-[0.14em] uppercase">
            CMS22204 · Ravensbourne
          </p>
        </div>
      </div>
    </footer>
  );
}
