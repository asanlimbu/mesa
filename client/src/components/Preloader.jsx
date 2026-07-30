/**
 * Preloader.
 *
 * Masks the first paint so the WebGL scene is never seen popping into
 * existence. A brass rule draws itself across the wordmark, then the whole
 * curtain lifts.
 *
 * Two rules it must obey: it lifts on a timer as well as on the load event, so
 * a stalled asset can never leave the site behind a curtain; and it shows once
 * per session, because a preloader on every navigation is an obstacle rather
 * than an entrance.
 */

import { useEffect, useState } from 'react';

const SEEN_KEY = 'mesa.entered';

export function Preloader() {
  const [show, setShow] = useState(() => !sessionStorage.getItem(SEEN_KEY));
  const [lifting, setLifting] = useState(false);

  useEffect(() => {
    if (!show) return undefined;

    document.body.style.overflow = 'hidden';

    const lift = () => {
      setLifting(true);
      sessionStorage.setItem(SEEN_KEY, '1');
      window.setTimeout(() => {
        setShow(false);
        document.body.style.overflow = '';
      }, 750);
    };

    // Whichever comes first: the page finishing, or the ceiling.
    const minimum = window.setTimeout(lift, document.readyState === 'complete' ? 900 : 1500);
    const ceiling = window.setTimeout(lift, 3200);

    return () => {
      window.clearTimeout(minimum);
      window.clearTimeout(ceiling);
      document.body.style.overflow = '';
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-ink transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        lifting ? 'pointer-events-none -translate-y-full opacity-0' : ''
      }`}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="h-8 w-8 text-brass">
            <rect
              x="6"
              y="10"
              width="20"
              height="11"
              rx="2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="70"
              strokeDashoffset="70"
              style={{ animation: 'draw 1.1s cubic-bezier(0.22,1,0.36,1) forwards' }}
            />
            <rect x="9.5" y="21" width="2" height="5" rx="1" fill="currentColor" opacity="0.9" />
            <rect x="20.5" y="21" width="2" height="5" rx="1" fill="currentColor" opacity="0.9" />
          </svg>
          <span className="font-display text-foil text-3xl leading-none font-semibold">
            Mesa
          </span>
        </div>

        {/* The rule expands from the centre — the loading signal itself. */}
        <span className="block h-px w-40 overflow-hidden bg-sage/20">
          <span
            className="block h-full w-full origin-left bg-gradient-to-r from-brass to-copper"
            style={{ animation: 'sweep 1.6s cubic-bezier(0.4,0,0.2,1) forwards' }}
          />
        </span>
      </div>
    </div>
  );
}
