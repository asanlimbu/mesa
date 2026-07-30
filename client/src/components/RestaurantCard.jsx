import { Link } from 'react-router-dom';

import { priceBandOf } from '../lib/format.js';
import { TiltCard } from './ui.jsx';

export function RestaurantCard({ restaurant }) {
  return (
    <TiltCard>
      <Link
        to={`/restaurants/${restaurant.slug}`}
        className="group block h-full overflow-hidden rounded-plate border border-sage/20 bg-banquette/40 transition-colors duration-300 hover:border-brass/50"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-ink-deep">
          <img
            src={restaurant.heroImage}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-85 transition-all duration-700 group-hover:scale-105 group-hover:opacity-100"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent"
          />

          <span className="absolute top-3 right-3 rounded-full border border-brass/40 bg-ink/80 px-2.5 py-1 font-mono text-[11px] font-medium text-brass backdrop-blur">
            {restaurant.rating.toFixed(1)}
          </span>
        </div>

        <div className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-xl leading-tight text-linen transition-colors group-hover:text-brass">
              {restaurant.name}
            </h3>
            <span className="shrink-0 font-mono text-xs text-sage">
              {priceBandOf(restaurant.priceBand)}
            </span>
          </div>

          <p className="mt-1 font-mono text-[11px] tracking-[0.1em] text-sage-dim uppercase">
            {restaurant.cuisine} · {restaurant.city}
          </p>

          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-sage">
            {restaurant.description}
          </p>
        </div>
      </Link>
    </TiltCard>
  );
}
