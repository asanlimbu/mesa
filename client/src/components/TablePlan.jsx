/**
 * The isometric floor plan.
 *
 * This is the signature element of the interface. Each shape is a real table
 * row from the database, laid out on a plan and tilted into an isometric view
 * with CSS 3D transforms — no WebGL, no runtime dependency.
 *
 * It earns its place by being informative rather than decorative: it shows
 * which tables are free at the chosen sitting, and highlights the one the
 * booking engine will actually allocate. That makes the server's
 * smallest-sufficient-table rule visible instead of hidden.
 *
 * Depth is drawn with stacked box-shadows rather than true extruded faces.
 * Inside a rotated plane the shadow offsets rotate too, which reads as solid
 * thickness, and it avoids the z-sorting fragility of stacking real faces.
 */

const CELL = 78;
const GAP = 14;

/**
 * Arrange tables on a plan.
 *
 * Real dining rooms are laid out by hand, but sorting small tables to the front
 * and staggering alternate rows reads convincingly as a room rather than a
 * spreadsheet.
 */
function layout(tables) {
  const columns = Math.min(4, Math.max(3, Math.ceil(Math.sqrt(tables.length))));

  return tables.map((table, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const stagger = row % 2 === 0 ? 0 : 0.5;

    const size =
      table.seats <= 2 ? 40 : table.seats <= 4 ? 50 : table.seats <= 6 ? 60 : 68;

    return {
      ...table,
      x: (column + stagger) * (CELL + GAP),
      y: row * (CELL + GAP),
      size,
      // Two-tops and large round tables are round; four- and six-tops square.
      round: table.seats <= 2 || table.seats >= 8,
    };
  });
}

/** Stacked shadows that read as table thickness in the rotated plane. */
function thickness(colour, depth = 7) {
  return Array.from(
    { length: depth },
    (_, index) => `0 ${index + 1}px 0 ${colour}`,
  ).join(', ');
}

export function TablePlan({
  tables = [],
  freeTableIds = null,
  allocatedTableId = null,
  className = '',
  compact = false,
}) {
  if (tables.length === 0) return null;

  const placed = layout(tables);
  const width = Math.max(...placed.map((t) => t.x)) + CELL;
  const height = Math.max(...placed.map((t) => t.y)) + CELL;

  // A null freeTableIds means availability is unknown — render tables neutral
  // rather than implying everything is bookable.
  const known = freeTableIds !== null;
  const isFree = (id) => (known ? freeTableIds.includes(id) : null);

  return (
    <div className={`stage-iso flex justify-center ${className}`}>
      <div className="plan-tilt relative" style={{ width, height }}>
        {/* The floor: a ruled plan, as drawn on graph paper. */}
        <div
          aria-hidden="true"
          className="absolute rounded-xl border border-sage/20 bg-ink-deep/80"
          style={{
            inset: -26,
            backgroundImage:
              'linear-gradient(to right, rgba(143,168,155,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(143,168,155,.08) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            boxShadow: thickness('rgba(7,16,9,.9)', 10),
          }}
        />

        {placed.map((table, index) => {
          const free = isFree(table.id);
          const allocated = table.id === allocatedTableId;

          const surface = allocated
            ? { fill: '#C9A227', edge: '#8a6f16', border: '#F6E08A', text: '#0B1A14' }
            : free === false
              ? { fill: '#3a1620', edge: '#250e15', border: '#8C2E44', text: '#8C2E44' }
              : free === true
                ? { fill: '#1f4536', edge: '#12281f', border: '#C9A227', text: '#C9A227' }
                : { fill: '#1c473a', edge: '#102a22', border: '#5C7268', text: '#8FA89B' };

          return (
            <div
              key={table.id}
              className="plan-rise absolute grid place-items-center transition-colors duration-500"
              style={{
                left: table.x + (CELL - table.size) / 2,
                top: table.y + (CELL - table.size) / 2,
                width: table.size,
                height: table.size,
                borderRadius: table.round ? '50%' : 10,
                background: surface.fill,
                border: `2px solid ${surface.border}`,
                boxShadow: `${thickness(surface.edge)}${
                  allocated ? ', 0 0 30px 6px rgba(232,193,79,.4)' : ''
                }`,
                animationDelay: `${index * 45}ms`,
              }}
            >
              <span
                className="plan-label font-mono text-[11px] font-bold tabular-nums"
                style={{ color: surface.text }}
              >
                {compact ? table.seats : table.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Legend for the plan, shown wherever availability is being displayed. */
export function TablePlanKey({ className = '' }) {
  const keys = [
    { label: 'Free', style: { background: '#1f4536', borderColor: '#C9A227' } },
    { label: 'Taken', style: { background: '#3a1620', borderColor: '#8C2E44' } },
    { label: 'Yours', style: { background: '#C9A227', borderColor: '#F6E08A' } },
  ];

  return (
    <ul className={`flex flex-wrap items-center gap-4 ${className}`}>
      {keys.map((key) => (
        <li key={key.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-sm border-2"
            style={key.style}
          />
          <span className="font-mono text-[11px] tracking-wider text-sage uppercase">
            {key.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
