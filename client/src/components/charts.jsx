/**
 * Charts, hand-built in SVG.
 *
 * The data shapes here are simple — one series of daily counts, one set of
 * hourly totals — so a charting library would add a dependency and a bundle
 * without adding capability.
 *
 * Each chart carries an accessible text summary, because an SVG of bars means
 * nothing to a screen reader.
 */

/** Smooth path through points, using a monotone-ish cubic for stability. */
function areaPath(points, width, height) {
  if (points.length < 2) return '';

  const line = points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const previous = points[index - 1];
      const controlX = (previous.x + point.x) / 2;
      return `C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(' ');

  return `${line} L ${width} ${height} L 0 ${height} Z`;
}

export function TrendChart({ series, label = 'Bookings per day' }) {
  const width = 640;
  const height = 180;

  const max = Math.max(1, ...series.map((entry) => entry.bookings));

  const points = series.map((entry, index) => ({
    x: (index / Math.max(1, series.length - 1)) * width,
    y: height - (entry.bookings / max) * (height - 12) - 6,
    entry,
  }));

  const peak = series.reduce(
    (best, entry) => (entry.bookings > best.bookings ? entry : best),
    series[0] ?? { bookings: 0, date: '' },
  );

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-44 w-full"
        role="img"
        aria-label={`${label}. Peak of ${peak.bookings} bookings on ${peak.date}.`}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9A227" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#C9A227" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath(points, width, height)} fill="url(#trendFill)" />

        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="#C9A227"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <figcaption className="mt-2 flex justify-between font-mono text-[10px] tracking-[0.1em] text-sage-dim uppercase">
        <span>{series[0]?.date}</span>
        <span>{series.at(-1)?.date}</span>
      </figcaption>
    </figure>
  );
}

export function HourBars({ hours }) {
  if (hours.length === 0) return null;

  const max = Math.max(...hours.map((hour) => hour.covers));
  const busiest = hours.reduce((best, hour) => (hour.covers > best.covers ? hour : best));

  return (
    <figure>
      <div
        className="flex items-end gap-1.5"
        role="img"
        aria-label={`Covers by hour. Busiest at ${busiest.hour}:00 with ${busiest.covers} covers.`}
      >
        {hours.map((hour) => (
          <div key={hour.hour} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={`w-full rounded-t transition-colors ${
                hour.hour === busiest.hour ? 'bg-brass' : 'bg-brass/30'
              }`}
              style={{ height: `${Math.max(3, (hour.covers / max) * 110)}px` }}
            />
            <span className="font-mono text-[9px] text-sage-dim tabular-nums">
              {hour.hour}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 font-mono text-[10px] tracking-[0.1em] text-sage-dim uppercase">
        Covers by hour of service
      </figcaption>
    </figure>
  );
}

/** A single headline number with its label and optional detail. */
export function StatTile({ label, value, detail, tone = 'linen' }) {
  const toneClass = {
    linen: 'text-linen',
    brass: 'text-brass',
    oxblood: 'text-oxblood-lit',
  }[tone];

  return (
    <div className="rounded-plate border border-sage/20 bg-banquette/40 p-5">
      <p className="font-mono text-[10px] tracking-[0.16em] text-sage uppercase">
        {label}
      </p>
      <p className={`font-display mt-2 text-4xl tabular-nums ${toneClass}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-sage-dim">{detail}</p>}
    </div>
  );
}
