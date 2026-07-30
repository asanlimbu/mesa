/**
 * Custom cursor.
 *
 * A brass dot that trails the pointer and swells over anything interactive,
 * with a difference blend so it stays legible on both the dark ground and the
 * brass buttons.
 *
 * Engages only for fine pointers and only when motion is welcome; otherwise the
 * system cursor is left exactly as it was.
 */

import { useEffect, useRef, useState } from 'react';

import { prefersReducedMotion } from '../lib/motion.js';

const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], label';

export function Cursor() {
  const dot = useRef(null);
  const ring = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine || prefersReducedMotion()) return undefined;

    setActive(true);
    document.documentElement.classList.add('cursor-hidden');

    // The dot tracks the pointer exactly; the ring lags, which is what reads as
    // weight. Interpolating the ring each frame is the only per-frame work here.
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const trail = { ...pointer };
    let frame;

    const onMove = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (dot.current) {
        dot.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
      }
    };

    const tick = () => {
      trail.x += (pointer.x - trail.x) * 0.16;
      trail.y += (pointer.y - trail.y) * 0.16;
      if (ring.current) {
        ring.current.style.transform = `translate3d(${trail.x}px, ${trail.y}px, 0) translate(-50%, -50%)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onOver = (event) => {
      const hit = event.target.closest?.(INTERACTIVE);
      ring.current?.classList.toggle('is-over', Boolean(hit));
    };

    const onLeaveWindow = () => {
      dot.current?.style.setProperty('opacity', '0');
      ring.current?.style.setProperty('opacity', '0');
    };

    const onEnterWindow = () => {
      dot.current?.style.setProperty('opacity', '1');
      ring.current?.style.setProperty('opacity', '1');
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerleave', onLeaveWindow);
    document.addEventListener('pointerenter', onEnterWindow);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerleave', onLeaveWindow);
      document.removeEventListener('pointerenter', onEnterWindow);
      document.documentElement.classList.remove('cursor-hidden');
    };
  }, []);

  if (!active) return null;

  return (
    <div aria-hidden="true">
      <div
        ref={dot}
        className="pointer-events-none fixed top-0 left-0 z-[60] h-1.5 w-1.5 rounded-full bg-brass-bright transition-opacity duration-200"
      />
      <div
        ref={ring}
        className="cursor-ring pointer-events-none fixed top-0 left-0 z-[59] h-8 w-8 rounded-full border border-brass/60 transition-[width,height,background-color,border-color] duration-300 ease-out"
        style={{ mixBlendMode: 'difference' }}
      />
    </div>
  );
}
