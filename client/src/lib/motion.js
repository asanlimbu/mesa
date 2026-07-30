/**
 * Motion primitives.
 *
 * Every hook here checks `prefers-reduced-motion` and disables itself, and none
 * of them is responsible for making content visible — a stalled animation loop
 * costs polish, never legibility.
 */

import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const finePointer = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Smooth scrolling with weight.
 *
 * Returns the Lenis instance so callers can stop it (a modal, say) or jump to
 * an anchor. Falls back to native scrolling when reduced motion is requested.
 */
export function useSmoothScroll() {
  const lenis = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;

    const instance = new Lenis({
      duration: 1.05,
      // Exponential ease-out: quick take-up, long settle. This is the whole
      // "weight" of the effect.
      easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      smoothWheel: true,
      // Touch devices already have momentum scrolling; doubling it feels wrong.
      syncTouch: false,
    });

    lenis.current = instance;

    let frame;
    const raf = (time) => {
      instance.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      instance.destroy();
      lenis.current = null;
    };
  }, []);

  return lenis;
}

/**
 * Scroll offset, sampled on scroll rather than every frame.
 *
 * Used for parallax. Reading scrollY in a passive listener and writing through
 * a transform keeps this off the layout path.
 */
export function useScrollOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setOffset(window.scrollY);
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return offset;
}

/**
 * Magnetic hover: the element leans toward the pointer and springs back.
 *
 * Pointer-driven rather than time-driven, so it is event-based and does not
 * depend on an animation loop running.
 *
 * @param {number} strength - fraction of the distance to the pointer to travel
 */
export function useMagnetic(strength = 0.32) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion() || !finePointer()) return undefined;

    const onMove = (event) => {
      const bounds = element.getBoundingClientRect();
      const x = event.clientX - (bounds.left + bounds.width / 2);
      const y = event.clientY - (bounds.top + bounds.height / 2);
      element.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    };

    const onLeave = () => {
      element.style.transform = '';
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);

    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
    };
  }, [strength]);

  return ref;
}
