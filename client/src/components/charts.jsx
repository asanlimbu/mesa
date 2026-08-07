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

const BRASS = '#d4a937';

/**
 * Round a maximum up so the axis divides into `ticks` whole steps. Booking
 * counts are integers, so a fractional gridline would be a lie.
 */
function niceMax(value, ticks = 4) {
  const step = Math.max(1, Math.ceil(value / ticks));
  return step * ticks;
}

/** Smooth path through points, using a monotone-ish cubic for stability. */
function linePath(points) {
  return points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const previous = points[index - 1];
      const controlX = (previous.x + point.x) / 2;
      return `C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(' ');
}

export function TrendChart({ series, label = 'Bookings per day' }) {
  // A fixed viewBox scaled by CSS. The aspect ratio is preserved rather than
  // stretched, because stretching would distort the axis text with it.
  const width = 640;
  const height = 210;
  const pad = { top: 14, right: 10, bottom: 24, left: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const ticks = 4;
  const max = niceMax(Math.max(1, ...series.map((entry) => entry.bookings)), ticks);

  const points = series.map((entry, index) => ({
    x: pad.left + (index / Math.max(1, series.length - 1)) * plotWidth,
    y: pad.top + plotHeight - (entry.bookings / max) * plotHeight,
    entry,
  }));

  const peak = series.reduce(
    (best, entry) => (entry.bookings > best.bookings ? entry : best),
    series[0] ?? { bookings: 0, date: '' },
  );

  const areaPath = points.length
    ? `${linePath(points)} L ${points.at(-1).x} ${pad.top + plotHeight} L ${points[0].x} ${pad.top + plotHeight} Z`
    : '';

  // 30 dots would read as noise; a month of data gets the line alone.
  const showDots = series.length <= 14;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full"
        role="img"
        aria-label={`${label}. Peak of ${peak.bookings} bookings on ${peak.date}.`}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRASS} stopOpacity="0.3" />
            <stop offset="100%" stopColor={BRASS} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines with their values, so the shape has a scale. */}
        {Array.from({ length: ticks + 1 }, (_, index) => {
          const value = (max / ticks) * index;
          const y = pad.top + plotHeight - (index / ticks) * plotHeight;
          return (
            <g key={value}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="#97b0a2"
                strokeOpacity="0.14"
                strokeDasharray={index === 0 ? undefined : '2 4'}
              />
              <text
                x={pad.left - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-sage-dim font-mono"
                fontSize="9"
              >
                {value}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#trendFill)" />

        <path
          d={linePath(points)}
          fill="none"
          stroke={BRASS}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {showDots &&
          points.map((point) => (
            <circle
              key={point.entry.date}
              cx={point.x}
              cy={point.y}
              r="3"
              fill="#071310"
              stroke={BRASS}
              strokeWidth="2"
            />
          ))}

        {/* The peak is the one point worth calling out by name. */}
        {points.length > 1 && (
          <circle
            cx={points.find((point) => point.entry.date === peak.date)?.x}
            cy={points.find((point) => point.entry.date === peak.date)?.y}
            r="4"
            fill={BRASS}
          />
        )}
      </svg>

      <figcaption className="mt-1 flex justify-between font-mono text-[10px] tracking-[0.1em] text-sage-dim uppercase">
        <span>{series[0]?.date}</span>
        <span>peak {peak.bookings} on {peak.date}</span>
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
        className="flex h-44 items-end gap-1.5"
        role="img"
        aria-label={`Covers by hour. Busiest at ${busiest.hour}:00 with ${busiest.covers} covers.`}
      >
        {hours.map((hour) => (
          <div key={hour.hour} className="group flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-[9px] text-sage-dim tabular-nums opacity-0 transition group-hover:opacity-100">
              {hour.covers}
            </span>
            <div
              className={`w-full rounded-t transition-colors ${
                hour.hour === busiest.hour
                  ? 'bg-brass'
                  : 'bg-brass/25 group-hover:bg-brass/50'
              }`}
              style={{ height: `${Math.max(3, (hour.covers / max) * 118)}px` }}
            />
            <span className="font-mono text-[9px] text-sage-dim tabular-nums">
              {hour.hour}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1 font-mono text-[10px] tracking-[0.1em] text-sage-dim uppercase">
        Covers by hour · busiest {busiest.hour}:00
      </figcaption>
    </figure>
  );
}

/** A single headline number with its label and optional detail. */
export function StatTile({ label, value, detail, tone = 'linen' }) {
  const toneClass = {
    linen: 'text-linen',
    brass: 'text-brass',
    verdigris: 'text-verdigris-lit',
    oxblood: 'text-oxblood-lit',
  }[tone];

  return (
    <div className="rounded-plate border border-sage/15 bg-banquette/50 p-5 transition-colors hover:border-sage/30">
      <p className="font-mono text-[10px] tracking-[0.16em] text-sage uppercase">
        {label}
      </p>
      <p className={`font-display mt-2 text-4xl tabular-nums ${toneClass}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-sage-dim">{detail}</p>}
    </div>
  );
}
