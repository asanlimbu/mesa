/**
 * Application shell: the top bar, the page outlet and the footer.
 */

import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';

import { useSmoothScroll } from '../lib/motion.js';
import { Cursor } from './Cursor.jsx';
import { Preloader } from './Preloader.jsx';

import { useAuth } from '../state/auth.jsx';
import { useToast } from '../state/toast.jsx';
import { Button } from './ui.jsx';
import { Footer } from './Footer.jsx';

function Wordmark() {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="Mesa, home">
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="h-7 w-7 text-brass transition-transform duration-500 group-hover:rotate-6"
      >
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
      <span className="font-display text-foil text-2xl leading-none font-semibold tracking-tight">
        Mesa
      </span>
    </Link>
  );
}

const linkClass = ({ isActive }) =>
  `text-sm transition-colors ${isActive ? 'text-brass' : 'text-sage hover:text-linen'}`;

export function Layout() {
  const { isSignedIn, isManager, user, signOut } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const lenis = useSmoothScroll();

  // Every route change starts at the top. Lenis owns the scroll position, so
  // asking the window directly would be ignored.
  useEffect(() => {
    lenis.current?.scrollTo(0, { immediate: true });
    window.scrollTo(0, 0);
  }, [location.pathname, lenis]);

  const handleSignOut = () => {
    signOut();
    notify('Signed out.');
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Preloader />
      <Cursor />
      <header className="sticky top-0 z-40 border-b border-sage/15 bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Wordmark />

          <nav className="ml-2 hidden items-center gap-6 sm:flex">
            <NavLink to="/restaurants" className={linkClass}>
              Restaurants
            </NavLink>
            {isSignedIn && !isManager && (
              <NavLink to="/reservations" className={linkClass}>
                My bookings
              </NavLink>
            )}
            {isManager && (
              <NavLink to="/manager" className={linkClass}>
                Dashboard
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {isSignedIn ? (
              <>
                <span className="hidden text-right text-xs leading-tight md:block">
                  <span className="block text-linen">{user.name}</span>
                  <span className="block font-mono text-[10px] tracking-[0.12em] text-sage-dim uppercase">
                    {isManager ? 'Manager' : 'Diner'}
                  </span>
                </span>
                <Button tone="ghost" onClick={handleSignOut} className="px-3">
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link
                  to="/sign-in"
                  className="text-sm text-sage transition-colors hover:text-linen"
                >
                  Sign in
                </Link>
                <Button
                  tone="outline"
                  onClick={() => navigate('/register')}
                  className="hidden sm:inline-flex"
                >
                  Create account
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Keyed on pathname so each route replays the entry animation. */}
      <main key={location.pathname} className="page-enter flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
