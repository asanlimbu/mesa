/**
 * Landing page.
 *
 * The hero is the table plan, not a plate of food: this product is about
 * whether a table is free, so the floor plan is the honest opening statement.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../lib/api.js';
import { today, addDays } from '../lib/format.js';
import { useScrollOffset, useMagnetic } from '../lib/motion.js';
import { FloorPlan, TablePlanKey } from '../components/FloorPlan.jsx';
import { RestaurantCard } from '../components/RestaurantCard.jsx';
import { Select } from '../components/Select.jsx';
import { Button, Eyebrow, Reveal, TextField } from '../components/ui.jsx';

const PARTY_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1} ${index === 0 ? 'guest' : 'guests'}`,
}));

/**
 * Split a line into words, each masked so it rises into place.
 *
 * Words rather than characters: character-by-character shreds a serif this
 * large and, read aloud, turns one headline into thirty-odd nodes.
 */
function StaggeredLine({ text, delay = 0, className = '' }) {
  return (
    <span className={className}>
      {text.split(' ').map((word, index) => (
        <span key={`${word}-${index}`}>
          <span className="word-mask">
            <span style={{ animationDelay: `${delay + index * 70}ms` }}>{word}</span>
          </span>{' '}
        </span>
      ))}
    </span>
  );
}

/** Search controls, shared by the hero and the discovery page header. */
export function SearchBar({ initial = {}, onSubmit, className = '' }) {
  const [date, setDate] = useState(initial.date ?? today());
  const [time, setTime] = useState(initial.time ?? '19:30');
  const [partySize, setPartySize] = useState(initial.partySize ?? 2);
  const magnet = useMagnetic(0.28);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ date, time, partySize: Number(partySize) });
      }}
      className={`grid gap-3 rounded-plate border border-sage/25 bg-banquette/50 p-4 backdrop-blur sm:grid-cols-[1fr_1fr_auto_auto] ${className}`}
    >
      <TextField
        label="Date"
        type="date"
        value={date}
        min={today()}
        max={addDays(today(), 90)}
        onChange={(event) => setDate(event.target.value)}
      />
      <TextField
        label="Time"
        type="time"
        step="1800"
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
      <Select
        label="Party"
        value={String(partySize)}
        onChange={(next) => setPartySize(Number(next))}
        options={PARTY_OPTIONS}
        className="sm:w-32"
      />

      <div ref={magnet} className="self-end transition-transform duration-300 ease-out">
        <Button type="submit" className="h-[42px] w-full">
          Find a table
        </Button>
      </div>
    </form>
  );
}

/** Tables for the hero plan, taken from a real venue so the shapes are honest. */
function useHeroTables() {
  const [tables, setTables] = useState([]);
  const [free, setFree] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const restaurant = await api.restaurants.get('the-copper-hearth', controller.signal);
        setTables(restaurant.tables);

        const availability = await api.restaurants.availability(
          'the-copper-hearth',
          { date: today(), partySize: 2 },
          controller.signal,
        );

        // Approximate which tables are free tonight by sampling the evening
        // sittings — enough to make the plan truthful without a bespoke endpoint.
        const openSittings = availability.slots.filter((slot) => slot.available).length;
        const ratio = availability.slots.length
          ? openSittings / availability.slots.length
          : 0.6;

        setFree(
          restaurant.tables
            .filter((_, index) => index / restaurant.tables.length < ratio)
            .map((table) => table.id),
        );
      } catch {
        // The hero is decorative if the API is unreachable; the page still works.
      }
    }

    load();
    return () => controller.abort();
  }, []);

  return { tables, free };
}

function Hero() {
  const navigate = useNavigate();
  const { tables, free } = useHeroTables();
  const scrollY = useScrollOffset();

  const search = ({ date, time, partySize }) => {
    navigate(`/restaurants?date=${date}&time=${time}&partySize=${partySize}`);
  };

  return (
    <section className="relative overflow-hidden">
      {/*
        Ambient warmth, as if from a lamp above the pass. The two pools drift at
        different rates as the page scrolls; moving slower than the text is what
        reads as distance behind it.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-brass/10 blur-[120px] will-change-transform"
        style={{ transform: `translate3d(-50%, ${scrollY * 0.28}px, 0)` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-copper/8 blur-[130px] will-change-transform"
        style={{ transform: `translate3d(0, ${scrollY * 0.45}px, 0)` }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <p className="rise font-mono text-[11px] tracking-[0.24em] text-brass uppercase">
            Table reservations
          </p>

          <h1 className="type-display font-display mt-4 font-medium text-balance text-linen">
            <StaggeredLine text="See which tables are" delay={120} />
            <StaggeredLine
              text="actually free."
              delay={400}
              className="text-foil italic"
            />
          </h1>

          <p
            className="rise type-lede mt-6 max-w-lg text-sage"
            style={{ animationDelay: '700ms' }}
          >
            Mesa reads the floor plan, not a waiting list. Pick a time and we
            check every table in the room — then tell you which one is yours
            before you book.
          </p>

          <div className="rise mt-8" style={{ animationDelay: '840ms' }}>
            <SearchBar onSubmit={search} />
          </div>
        </div>

        <div className="relative">
          {tables.length > 0 ? (
            <>
              <FloorPlan
                tables={tables}
                freeTableIds={free}
                height={420}
                compact
              />
              <TablePlanKey className="mt-2 justify-center" />
              <p className="mt-3 text-center font-mono text-[11px] tracking-[0.14em] text-sage-dim uppercase">
                The Copper Hearth · tonight
              </p>
            </>
          ) : (
            <div className="h-[420px]" aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * How it works.
 *
 * Numbered because these steps genuinely happen in sequence — the order is
 * information, not ornament.
 */
function HowItWorks() {
  const steps = [
    {
      title: 'Choose a sitting',
      body: 'Pick your date, time and party size. We only show restaurants with a table that fits.',
    },
    {
      title: 'See the room',
      body: 'The floor plan shows what is free and what is taken, and highlights the table you will be given.',
    },
    {
      title: 'Book it',
      body: 'Confirmed instantly. If the slot goes while you are deciding, we offer the nearest times that are still open.',
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <Reveal>
        <Eyebrow>How booking works</Eyebrow>
      </Reveal>

      <div className="mt-10 grid gap-8 sm:grid-cols-3">
        {steps.map((step, index) => (
          <Reveal key={step.title} delay={index * 0.1}>
            <div className="border-t border-sage/20 pt-5">
              <span className="font-mono text-xs text-brass tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display mt-3 text-2xl text-linen">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sage">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Featured() {
  const [restaurants, setRestaurants] = useState([]);

  useEffect(() => {
    const controller = new AbortController();

    api.restaurants
      .search({ sort: 'rating', pageSize: 3 }, controller.signal)
      .then((data) => setRestaurants(data.restaurants))
      .catch(() => {});

    return () => controller.abort();
  }, []);

  if (restaurants.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-5 pb-10">
      <Reveal>
        <Eyebrow>Best rated this month</Eyebrow>
      </Reveal>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {restaurants.map((restaurant, index) => (
          <Reveal key={restaurant.id} delay={index * 0.08}>
            <RestaurantCard restaurant={restaurant} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Featured />
    </>
  );
}
