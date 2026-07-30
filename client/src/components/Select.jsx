/**
 * Custom select.
 *
 * A native <select> hands the menu to the operating system, which breaks the
 * page's visual language at exactly the moment the user is making a choice.
 * This renders the menu itself, in the app's own palette.
 *
 * Built rather than pulled from Radix or Headless UI: the listbox pattern is
 * small enough to own, and it avoids adding a dependency to explain in a
 * coursework submission.
 *
 * Implements the WAI-ARIA listbox pattern — arrow keys move the active option,
 * Home/End jump, Enter/Space commit, Escape closes, typing jumps to a match,
 * and the trigger keeps focus throughout so screen readers follow along.
 */

import { useEffect, useId, useRef, useState } from 'react';

export function Select({
  label,
  value,
  onChange,
  options,
  className = '',
  buttonClassName = '',
  hint,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value)),
  );

  const wrapper = useRef(null);
  const listRef = useRef(null);
  const typeahead = useRef({ query: '', at: 0 });

  const id = useId();
  const listId = `${id}-list`;

  const selected = options.find((option) => option.value === value) ?? options[0];

  // Close on an outside click or a scroll away from the control.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the active option in view when arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children?.[activeIndex];
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const commit = (index) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) commit(activeIndex);
        else setOpen(true);
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default: {
        // Typeahead: printable keys jump to the first matching label.
        if (event.key.length !== 1) return;
        const now = Date.now();
        const state = typeahead.current;
        state.query = now - state.at > 700 ? event.key : state.query + event.key;
        state.at = now;

        const match = options.findIndex((option) =>
          option.label.toLowerCase().startsWith(state.query.toLowerCase()),
        );
        if (match >= 0) {
          setActiveIndex(match);
          if (!open) commit(match);
        }
      }
    }
  };

  return (
    <div className={className} ref={wrapper}>
      {label && (
        <span
          id={`${id}-label`}
          className="mb-1.5 block font-mono text-[11px] tracking-[0.14em] text-sage uppercase"
        >
          {label}
        </span>
      )}

      <div className="relative">
        <button
          type="button"
          id={id}
          role="combobox"
          aria-controls={listId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby={label ? `${id}-label ${id}` : undefined}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          onKeyDown={onKeyDown}
          className={`flex w-full items-center justify-between gap-2 rounded-plate border bg-ink-deep/60 px-3.5 py-2.5 text-left text-sm text-linen transition focus:outline-none ${
            open ? 'border-brass' : 'border-sage/25 hover:border-sage/45'
          } ${buttonClassName}`}
        >
          <span className="truncate">{selected?.label}</span>
          <svg
            viewBox="0 0 12 8"
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 text-sage transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          >
            <path
              d="M1 1.5 6 6.5 11 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={label ? `${id}-label` : undefined}
            tabIndex={-1}
            className="absolute z-50 mt-2 max-h-64 w-full origin-top overflow-auto rounded-plate border border-brass/30 bg-banquette p-1 shadow-2xl shadow-ink-deep/80"
            style={{ animation: 'menu-in 0.18s cubic-bezier(0.22,1,0.36,1)' }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;

              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive ? 'bg-brass/15 text-brass' : 'text-linen'
                  }`}
                >
                  <span>{option.label}</span>
                  {isSelected && (
                    <svg viewBox="0 0 12 10" aria-hidden="true" className="h-2.5 w-2.5 text-brass">
                      <path
                        d="M1 5 4.5 8.5 11 1.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hint && <p className="mt-1.5 text-xs text-sage-dim">{hint}</p>}
    </div>
  );
}
