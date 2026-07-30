/**
 * Restaurant discovery: search, filter, sort, paginate.
 *
 * Filter state lives in the URL so a search is shareable and survives a reload.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { api } from '../lib/api.js';
import { priceBandOf } from '../lib/format.js';
import { RestaurantCard } from '../components/RestaurantCard.jsx';
import { Select } from '../components/Select.jsx';
import { SearchBar } from './Landing.jsx';
import {
  Button,
  Eyebrow,
  EmptyState,
  ErrorNote,
  Reveal,
  Spinner,
  TextField,
} from '../components/ui.jsx';

const SORTS = [
  { value: 'rating', label: 'Highest rated' },
  { value: 'name', label: 'Name, A–Z' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'price_desc', label: 'Price, high to low' },
];

function FilterPanel({ params, setParam, options, onClear, activeCount }) {
  const selectedCuisines = params.getAll('cuisine');
  const selectedBands = params.getAll('priceBand');

  const toggle = (key, value) => {
    const current = params.getAll(key);
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    setParam(key, next);
  };

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-center justify-between">
        <Eyebrow className="flex-1">Filters</Eyebrow>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-3 shrink-0 text-xs text-sage underline-offset-4 transition hover:text-brass hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="mt-6 space-y-7">
        <TextField
          label="Search"
          type="search"
          placeholder="Name or dish"
          defaultValue={params.get('q') ?? ''}
          onChange={(event) => setParam('q', event.target.value)}
        />

        <Select
          label="City"
          value={params.get('city') ?? ''}
          onChange={(next) => setParam('city', next)}
          options={[
            { value: '', label: 'Anywhere' },
            ...options.cities.map((city) => ({ value: city, label: city })),
          ]}
        />

        <fieldset>
          <legend className="mb-2.5 font-mono text-[11px] tracking-[0.14em] text-sage uppercase">
            Cuisine
          </legend>
          <div className="flex flex-wrap gap-2">
            {options.cuisines.map((cuisine) => {
              const active = selectedCuisines.includes(cuisine);
              return (
                <button
                  key={cuisine}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle('cuisine', cuisine)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    active
                      ? 'border-brass bg-brass/15 text-brass'
                      : 'border-sage/25 text-sage hover:border-sage/50 hover:text-linen'
                  }`}
                >
                  {cuisine}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 font-mono text-[11px] tracking-[0.14em] text-sage uppercase">
            Price
          </legend>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((band) => {
              const active = selectedBands.includes(String(band));
              return (
                <button
                  key={band}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Price band ${band} of 4`}
                  onClick={() => toggle('priceBand', String(band))}
                  className={`flex-1 rounded-plate border py-2 font-mono text-xs transition ${
                    active
                      ? 'border-brass bg-brass/15 text-brass'
                      : 'border-sage/25 text-sage hover:border-sage/50 hover:text-linen'
                  }`}
                >
                  {priceBandOf(band)}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </aside>
  );
}

export function Discover() {
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [options, setOptions] = useState({ cuisines: [], cities: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api.restaurants
      .filters(controller.signal)
      .then(setOptions)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Debounced so typing in the search box does not fire a request per keystroke.
    const timer = setTimeout(() => {
      api.restaurants
        .search(Object.fromEntries(collect(params)), controller.signal)
        .then((data) => {
          setResult(data);
          setLoading(false);
        })
        .catch((requestError) => {
          if (requestError.name === 'AbortError') return;
          setError(requestError.message);
          setLoading(false);
        });
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params]);

  /** URLSearchParams → entries, preserving repeated keys as arrays. */
  function collect(source) {
    const map = new Map();
    for (const [key, value] of source.entries()) {
      if (map.has(key)) {
        const existing = map.get(key);
        map.set(key, Array.isArray(existing) ? [...existing, value] : [existing, value]);
      } else {
        map.set(key, value);
      }
    }
    return map;
  }

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    next.delete(key);

    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else if (value) next.set(key, value);

    next.delete('page'); // any filter change returns to the first page
    setParams(next, { replace: true });
  };

  const hasSitting = params.get('date') && params.get('time') && params.get('partySize');

  const activeCount = ['q', 'city', 'cuisine', 'priceBand'].reduce(
    (count, key) => count + params.getAll(key).filter(Boolean).length,
    0,
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="font-display text-4xl text-linen sm:text-5xl">Restaurants</h1>
      <p className="mt-2 max-w-xl text-sage">
        {hasSitting
          ? 'Showing only restaurants with a table free at your sitting.'
          : 'Add a date and time to see only what is genuinely bookable.'}
      </p>

      <SearchBar
        className="mt-8"
        initial={{
          date: params.get('date') ?? undefined,
          time: params.get('time') ?? undefined,
          partySize: params.get('partySize') ?? undefined,
        }}
        onSubmit={({ date, time, partySize }) => {
          const next = new URLSearchParams(params);
          next.set('date', date);
          next.set('time', time);
          next.set('partySize', partySize);
          next.delete('page');
          setParams(next, { replace: true });
        }}
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-[16rem_1fr]">
        <FilterPanel
          params={params}
          setParam={setParam}
          options={options}
          activeCount={activeCount}
          onClear={() => setParams(new URLSearchParams(), { replace: true })}
        />

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-xs tracking-[0.12em] text-sage uppercase">
              {loading
                ? 'Searching…'
                : `${result?.total ?? 0} ${result?.total === 1 ? 'restaurant' : 'restaurants'}`}
            </p>

            <div className="flex items-center gap-2 text-xs text-sage">
              <span>Sort</span>
              <Select
                value={params.get('sort') ?? 'rating'}
                onChange={(next) => setParam('sort', next)}
                options={SORTS}
                className="w-48"
                buttonClassName="py-1.5 text-xs"
              />
            </div>
          </div>

          {error && <ErrorNote className="mb-6">{error}</ErrorNote>}

          {loading && !result && <Spinner label="Finding tables" />}

          {result && result.restaurants.length === 0 && (
            <EmptyState
              title="Nothing free at that sitting"
              action={
                <Button
                  tone="outline"
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}
                >
                  Clear filters
                </Button>
              }
            >
              Try a different time, a smaller party, or widen the filters.
            </EmptyState>
          )}

          {result && result.restaurants.length > 0 && (
            <>
              <div className="grid gap-6 sm:grid-cols-2">
                {result.restaurants.map((restaurant, index) => (
                  <Reveal key={restaurant.id} delay={Math.min(index * 0.05, 0.3)}>
                    <RestaurantCard restaurant={restaurant} />
                  </Reveal>
                ))}
              </div>

              {result.pages > 1 && (
                <nav className="mt-10 flex items-center justify-center gap-4">
                  <Button
                    tone="outline"
                    disabled={result.page <= 1}
                    onClick={() => setParam('page', String(result.page - 1))}
                  >
                    Previous
                  </Button>
                  <span className="font-mono text-xs text-sage tabular-nums">
                    {result.page} / {result.pages}
                  </span>
                  <Button
                    tone="outline"
                    disabled={result.page >= result.pages}
                    onClick={() => setParam('page', String(result.page + 1))}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
