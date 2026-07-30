/**
 * Floor plan with a guaranteed fallback.
 *
 * Prefers the WebGL scene. Falls back to the flat CSS plan when the browser has
 * no WebGL, when the user asks for reduced motion, or when the 3D scene throws —
 * the floor plan carries real booking information, so it must never be the
 * reason a diner cannot see which tables are free.
 */

import { Component, lazy, Suspense, useEffect, useState } from 'react';

import { TablePlan, TablePlanKey } from './TablePlan.jsx';

// Keeps three.js out of the initial bundle; it only loads where it will be used.
const TablePlan3D = lazy(() =>
  import('./TablePlan3D.jsx').then((module) => ({ default: module.TablePlan3D })),
);

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

/** Catches a WebGL failure at runtime and shows the flat plan instead. */
class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('3D floor plan unavailable, falling back to the flat plan.', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function FloorPlan({
  tables = [],
  freeTableIds = null,
  allocatedTableId = null,
  className = '',
  height = 380,
  compact = false,
}) {
  const [use3D, setUse3D] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setUse3D(!reduced && webglAvailable());
  }, []);

  const flat = (
    <TablePlan
      tables={tables}
      freeTableIds={freeTableIds}
      allocatedTableId={allocatedTableId}
      compact={compact}
      className="py-8"
    />
  );

  if (tables.length === 0) return null;

  if (!use3D) return <div className={className}>{flat}</div>;

  return (
    // Lifted above the film grain: a full-screen overlay stacked over a WebGL
    // canvas blanks it in Chromium, so the canvas has to own the higher layer.
    <div className={`relative z-[41] ${className}`}>
      <SceneBoundary fallback={flat}>
        <Suspense fallback={<div style={{ height }} />}>
          <TablePlan3D
            tables={tables}
            freeTableIds={freeTableIds}
            allocatedTableId={allocatedTableId}
            height={height}
          />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}

export { TablePlanKey };
