/**
 * Shared UI primitives.
 *
 * Small, unopinionated pieces used across pages so spacing, focus states and
 * type treatment stay consistent.
 */

import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import { STATUS_COPY } from '../lib/format.js';

/* ── Section label ───────────────────────────────────────────────────────── */

/**
 * The eyebrow above a section, set in the mono face with a ledger rule — the
 * vernacular of a service sheet rather than generic decoration.
 */
export function Eyebrow({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="font-mono text-[11px] tracking-[0.2em] text-brass uppercase">
        {children}
      </span>
      <span aria-hidden="true" className="rule-ledger h-px flex-1" />
    </div>
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

const BUTTON_TONES = {
  brass:
    'bg-brass text-ink hover:bg-brass-bright disabled:hover:bg-brass shadow-lg shadow-brass/20',
  outline:
    'border border-sage/35 text-linen hover:border-brass hover:text-brass disabled:hover:border-sage/35 disabled:hover:text-linen',
  ghost: 'text-sage hover:text-linen disabled:hover:text-sage',
  danger: 'border border-oxblood-lit text-oxblood-lit hover:bg-oxblood hover:text-linen',
};

export const Button = forwardRef(function Button(
  { tone = 'brass', className = '', busy = false, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-plate px-5 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_TONES[tone]} ${className}`}
    >
      {busy && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});

/* ── Form fields ─────────────────────────────────────────────────────────── */

const FIELD_BASE =
  'w-full rounded-plate border bg-ink-deep/60 px-3.5 py-2.5 text-sm text-linen placeholder:text-sage-dim transition focus:outline-none';

export function Field({ label, error, hint, children, className = '' }) {
  const id = useId();

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[11px] tracking-[0.14em] text-sage uppercase"
      >
        {label}
      </label>

      {children({ id, className: `${FIELD_BASE} ${error ? 'border-oxblood-lit' : 'border-sage/25 focus:border-brass'}` })}

      {error && <p className="mt-1.5 text-xs text-oxblood-lit">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-xs text-sage-dim">{hint}</p>}
    </div>
  );
}

export function TextField({ label, error, hint, className, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(fieldProps) => <input {...fieldProps} {...props} />}
    </Field>
  );
}

export function SelectField({ label, error, hint, className, children, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(fieldProps) => (
        <select {...fieldProps} {...props}>
          {children}
        </select>
      )}
    </Field>
  );
}

/* ── Status ──────────────────────────────────────────────────────────────── */

const TONE_CLASSES = {
  brass: 'border-brass/40 bg-brass/10 text-brass',
  sage: 'border-sage/30 bg-sage/10 text-sage',
  oxblood: 'border-oxblood-lit/50 bg-oxblood/20 text-oxblood-lit',
};

export function StatusPill({ status, className = '' }) {
  const copy = STATUS_COPY[status] ?? { label: status, tone: 'sage' };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.12em] uppercase ${TONE_CLASSES[copy.tone]} ${className}`}
    >
      {copy.label}
    </span>
  );
}

/* ── Motion ──────────────────────────────────────────────────────────────── */

/**
 * Scroll-triggered reveal.
 *
 * IntersectionObserver toggles a class and CSS runs the transition. Nothing
 * here depends on an animation frame loop, so a page that never gets one still
 * shows its content — and if IntersectionObserver is missing the element is
 * simply revealed immediately.
 */
export function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -60px 0px' },
    );

    observer.observe(element);

    // Safety net. An element that is scrolled past without ever intersecting —
    // arriving mid-page on a hash link, or a restored scroll position — would
    // otherwise stay hidden for good. Content is never allowed to depend on a
    // scroll event that may not happen.
    const fallback = setTimeout(() => {
      setVisible(true);
      observer.disconnect();
    }, 1200);

    return () => {
      clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

/**
 * Pointer-tracked 3D tilt.
 *
 * Uses CSS transforms on a perspective parent — the same depth idea as the
 * table plan, applied at card scale so the two read as one system.
 */
export function TiltCard({ children, className = '', intensity = 6 }) {
  const reduced = useReducedMotion();

  const handleMove = (event) => {
    if (reduced) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    event.currentTarget.style.transform = `perspective(900px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) translateZ(6px)`;
  };

  const handleLeave = (event) => {
    event.currentTarget.style.transform = '';
  };

  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Feedback states ─────────────────────────────────────────────────────── */

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sage">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-sage/40 border-t-brass"
      />
      <span className="font-mono text-xs tracking-[0.14em] uppercase">{label}</span>
    </div>
  );
}

/** An empty screen is an invitation to act, so it always offers the next step. */
export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-plate border border-dashed border-sage/25 bg-banquette/25 px-6 py-14 text-center">
      <h3 className="font-display text-xl text-linen">{title}</h3>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-sage">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children, className = '' }) {
  return (
    <p
      role="alert"
      className={`rounded-plate border border-oxblood-lit/50 bg-oxblood/15 px-3.5 py-2.5 text-sm text-linen ${className}`}
    >
      {children}
    </p>
  );
}
