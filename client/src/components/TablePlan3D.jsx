/**
 * The floor plan, in real 3D.
 *
 * WebGL via react-three-fiber. Each mesh is a real table row from the database:
 * free tables sit low and lit, taken tables sink and go dark, and the table the
 * booking engine will allocate rises, glows and turns under a spotlight.
 *
 * The scene keeps a slow orbit so the room reads as an object rather than a
 * picture. Everything degrades: no WebGL, or a reduced-motion preference, and
 * the caller falls back to the flat CSS plan.
 */

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox, Cylinder, ContactShadows, Float } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Scene colours.
 *
 * Tops stay muted and close to the room; only the rims carry saturation. A
 * fully saturated tabletop reads as a plastic counter rather than a table under
 * restaurant lighting.
 */
const PALETTE = {
  floor: '#12291f',
  grid: '#3f7a64',
  free: '#1b4034',
  freeEdge: '#3d9077',
  taken: '#341620',
  takenEdge: '#8c3048',
  allocated: '#c19a30',
  allocatedEdge: '#f5d77a',
  neutral: '#1a3a30',
  neutralEdge: '#5a7166',
};

const CELL = 1.5;

/** Lay tables out on a grid, staggering alternate rows so it reads as a room. */
function layout(tables) {
  const columns = Math.min(4, Math.max(3, Math.ceil(Math.sqrt(tables.length))));
  const rows = Math.ceil(tables.length / columns);

  return tables.map((table, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const stagger = row % 2 === 0 ? 0 : 0.5;

    return {
      ...table,
      // Centre the whole arrangement on the origin.
      x: (column + stagger - (columns - 1) / 2) * CELL,
      z: (row - (rows - 1) / 2) * CELL,
      radius: table.seats <= 2 ? 0.34 : table.seats <= 4 ? 0.44 : table.seats <= 6 ? 0.54 : 0.62,
      round: table.seats <= 2 || table.seats >= 8,
    };
  });
}

function surfaceFor(state) {
  if (state === 'allocated') return { top: PALETTE.allocated, edge: PALETTE.allocatedEdge, emissive: PALETTE.allocated, intensity: 0.85 };
  if (state === 'taken') return { top: PALETTE.taken, edge: PALETTE.takenEdge, emissive: PALETTE.takenEdge, intensity: 0.08 };
  if (state === 'free') return { top: PALETTE.free, edge: PALETTE.freeEdge, emissive: PALETTE.freeEdge, intensity: 0.22 };
  return { top: PALETTE.neutral, edge: PALETTE.neutralEdge, emissive: PALETTE.neutralEdge, intensity: 0.05 };
}

/** One table: a top, a pedestal, and a rim that carries the state colour. */
function Table({ table, state, onHover }) {
  const group = useRef();
  const [hovered, setHovered] = useState(false);

  const surface = useMemo(() => surfaceFor(state), [state]);
  const allocated = state === 'allocated';
  const taken = state === 'taken';

  // Rest height: allocated tables sit proudest, taken tables sink.
  const restY = allocated ? 0.26 : taken ? -0.06 : 0.04;

  useFrame((frameState, delta) => {
    if (!group.current) return;

    const target = restY + (hovered ? 0.16 : 0);
    group.current.position.y += (target - group.current.position.y) * Math.min(1, delta * 8);

    // The allocated table turns slowly, so the eye lands on it.
    if (allocated) {
      group.current.rotation.y += delta * 0.55;
    } else if (hovered) {
      group.current.rotation.y += delta * 0.9;
    }
  });

  // Tops are thick enough to read as objects rather than discs painted on the
  // floor — at this camera elevation a thin slab disappears entirely.
  const Top = table.round ? Cylinder : RoundedBox;
  const topProps = table.round
    ? { args: [table.radius, table.radius, 0.2, 44] }
    : { args: [table.radius * 1.9, 0.2, table.radius * 1.9], radius: 0.06, smoothness: 4 };

  return (
    <group position={[table.x, restY, table.z]}>
      <group
        ref={group}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          onHover?.(table);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHover?.(null);
        }}
      >
        {/* Table top */}
        <Top {...topProps} castShadow receiveShadow>
          <meshStandardMaterial
            color={surface.top}
            emissive={new THREE.Color(surface.emissive)}
            emissiveIntensity={hovered ? surface.intensity + 0.25 : surface.intensity}
            metalness={allocated ? 0.75 : 0.25}
            roughness={allocated ? 0.22 : 0.62}
          />
        </Top>

        {/* Rim — a lit band around the *side* of the table. It sits below the
            top surface so the eye reads a dark tabletop with a glowing edge,
            not a saturated disc. */}
        <Cylinder
          args={[
            table.radius * (table.round ? 1.08 : 1.42),
            table.radius * (table.round ? 1.08 : 1.42),
            0.075,
            52,
          ]}
          position={[0, -0.035, 0]}
        >
          <meshStandardMaterial
            color={surface.edge}
            emissive={new THREE.Color(surface.edge)}
            emissiveIntensity={allocated ? 2.2 : taken ? 0.5 : 1.3}
            toneMapped={false}
          />
        </Cylinder>

        {/* Pedestal and foot */}
        <Cylinder args={[0.06, 0.09, 0.3, 20]} position={[0, -0.14, 0]} castShadow>
          <meshStandardMaterial color={surface.top} metalness={0.6} roughness={0.4} />
        </Cylinder>
        <Cylinder args={[table.radius * 0.45, table.radius * 0.5, 0.04, 24]} position={[0, -0.29, 0]}>
          <meshStandardMaterial color={surface.top} metalness={0.6} roughness={0.45} />
        </Cylinder>
      </group>
    </group>
  );
}

/** The room: floor slab, grid lines, and the tables. */
function Room({ tables, freeTableIds, allocatedTableId, onHover }) {
  const placed = useMemo(() => layout(tables), [tables]);
  const spin = useRef();

  // Keep the slab close to the tables. A generous margin reads as an empty
  // car park rather than a dining room, and it rotates out of frame.
  const extentX = Math.max(...placed.map((t) => Math.abs(t.x))) + 0.85;
  const extentZ = Math.max(...placed.map((t) => Math.abs(t.z))) + 0.85;
  const span = Math.max(extentX, extentZ);

  useFrame((state, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.12;
  });

  const stateOf = (table) => {
    if (table.id === allocatedTableId) return 'allocated';
    if (freeTableIds === null) return 'neutral';
    return freeTableIds.includes(table.id) ? 'free' : 'taken';
  };

  // The room turns, so what has to fit the frame is its rotating bounding
  // circle, not its width. Normalising on the half-diagonal keeps a six-table
  // venue and a ten-table venue both framed the same way.
  // Looking down at ~40° foreshortens the depth axis, so the slab occupies less
  // vertical screen space than its raw diagonal implies — hence the generous
  // factor here rather than a strict 1:1 fit.
  const fit = 3.6 / (span * Math.SQRT2);

  return (
    <group ref={spin} scale={fit}>
      <Float speed={1.1} rotationIntensity={0.06} floatIntensity={0.22}>
        {/* Floor slab. Square, so the grid drawn on it cannot overhang an
            edge when the room is wider than it is deep. */}
        <RoundedBox
          args={[span * 2, 0.14, span * 2]}
          radius={0.09}
          smoothness={4}
          position={[0, -0.42, 0]}
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.floor} metalness={0.2} roughness={0.55} />
        </RoundedBox>

        {/* Grid, drawn just above the slab like a plan on paper. Sized to the
            slab so it cannot spill past the edge. */}
        <gridHelper args={[span * 2, 12, PALETTE.grid, PALETTE.grid]} position={[0, -0.34, 0]}>
          <lineBasicMaterial attach="material" transparent opacity={0.45} />
        </gridHelper>

        {placed.map((table) => (
          <Table key={table.id} table={table} state={stateOf(table)} onHover={onHover} />
        ))}

        <ContactShadows
          position={[0, -0.32, 0]}
          opacity={0.65}
          scale={span * 2.6}
          blur={2}
          far={1.8}
          color="#000000"
        />
      </Float>
    </group>
  );
}

export function TablePlan3D({
  tables = [],
  freeTableIds = null,
  allocatedTableId = null,
  className = '',
  height = 380,
}) {
  const [hovered, setHovered] = useState(null);

  if (tables.length === 0) return null;

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        // Looking down at roughly 45°: low enough to keep the tables as solid
        // objects, high enough that the arrangement still reads as a plan.
        camera={{ position: [0, 5.4, 7.0], fov: 34 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          {/* Warm key from above the pass, cool fill from the room, and two
              coloured rims so the metal has something to catch. */}
          <ambientLight intensity={0.7} color="#cfe3d8" />
          <hemisphereLight args={['#a9cdbc', '#08130f', 0.55]} />
          <directionalLight
            position={[4.5, 8, 3.5]}
            intensity={3.2}
            color="#ffdfae"
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-camera-near={1}
            shadow-camera-far={22}
            shadow-camera-left={-8}
            shadow-camera-right={8}
            shadow-camera-top={8}
            shadow-camera-bottom={-8}
          />
          <pointLight position={[-4.5, 3.2, -3.5]} intensity={45} color="#4ea88b" distance={16} />
          <pointLight position={[3.5, 2.6, 4.5]} intensity={38} color="#e08a55" distance={14} />
          <spotLight
            position={[0, 7.5, 0]}
            angle={0.7}
            penumbra={0.85}
            intensity={55}
            color="#fff0d0"
            distance={18}
          />

          <Room
            tables={tables}
            freeTableIds={freeTableIds}
            allocatedTableId={allocatedTableId}
            onHover={setHovered}
          />
        </Suspense>
      </Canvas>

      {/* Hover read-out, in the service-sheet voice. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <p
          className={`font-mono text-[11px] tracking-[0.14em] uppercase transition-opacity duration-200 ${
            hovered ? 'text-brass opacity-100' : 'opacity-0'
          }`}
        >
          {hovered ? `Table ${hovered.label} · ${hovered.seats} seats` : '—'}
        </p>
      </div>
    </div>
  );
}
