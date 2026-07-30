/**
 * The dining room, in 3D.
 *
 * Every setting is a real table with a chair per cover, laid out from actual
 * table rows in the database. Availability shows in the upholstery and in a
 * pool of light on the floor beneath each setting; the furniture itself stays
 * wood and metal.
 *
 * The room turns slowly and leans toward the pointer. The table the booking
 * engine will allocate rises, brightens and turns on the spot.
 *
 * Degrades all the way down: no WebGL, or a reduced-motion preference, and the
 * caller falls back to the flat CSS plan.
 */

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox, ContactShadows, Float } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

import { Chair, RoundTable, RectTable, StateGlow, seatPositions } from './furniture.jsx';

const PALETTE = {
  floor: '#382c20',
  grid: '#6b543a',
};

/**
 * Upholstery and floor glow per availability state.
 *
 * Upholstery is tan leather throughout — only its warmth shifts with state.
 * Availability reads unambiguously from the floor glow instead, so the chairs
 * stay part of the room rather than becoming coloured markers.
 */
const STATES = {
  free: { upholstery: '#9a6b43', emissive: '#f0b96a', glow: '#f0b96a', lift: 0.14, glowIntensity: 1.7 },
  taken: { upholstery: '#4a3529', emissive: '#8c3048', glow: '#8c3048', lift: 0.02, glowIntensity: 0.6 },
  allocated: { upholstery: '#c79a52', emissive: '#ffe0a8', glow: '#ffe0a8', lift: 0.45, glowIntensity: 3.4 },
  neutral: { upholstery: '#6b503a', emissive: '#8a6a4a', glow: '#8a6a4a', lift: 0.05, glowIntensity: 0.4 },
};

/** Grid pitch. A setting is the table plus its ring of chairs, so it is wide. */
const CELL = 2.35;

function layout(tables) {
  const columns = Math.min(4, Math.max(3, Math.ceil(Math.sqrt(tables.length))));
  const rows = Math.ceil(tables.length / columns);

  return tables.map((table, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const stagger = row % 2 === 0 ? 0 : 0.5;

    // Round for two-tops and the big communal table; rectangular in between.
    const round = table.seats <= 2 || table.seats >= 8;

    const halfWidth = round
      ? table.seats <= 2
        ? 0.32
        : 0.58
      : table.seats <= 4
        ? 0.44
        : 0.6;

    const halfDepth = round ? halfWidth : table.seats <= 4 ? 0.36 : 0.4;

    return {
      ...table,
      round,
      halfWidth,
      halfDepth,
      // Centre the arrangement on the origin.
      x: (column + stagger - (columns - 1) / 2) * CELL,
      z: (row - (rows - 1) / 2) * CELL,
    };
  });
}

/** One setting: a table, a chair per cover, and its pool of light. */
function Setting({ table, state, onHover }) {
  const group = useRef();
  const [hovered, setHovered] = useState(false);

  const look = STATES[state] ?? STATES.neutral;
  const allocated = state === 'allocated';

  const seats = useMemo(
    () => seatPositions(table.seats, table.halfWidth, table.halfDepth),
    [table.seats, table.halfWidth, table.halfDepth],
  );

  const restY = allocated ? 0.24 : hovered ? 0.12 : 0;

  useFrame((frameState, delta) => {
    if (!group.current) return;

    group.current.position.y += (restY - group.current.position.y) * Math.min(1, delta * 7);

    // The allocated setting turns on the spot, so the eye lands on it.
    if (allocated) group.current.rotation.y += delta * 0.4;
    else if (hovered) group.current.rotation.y += delta * 0.65;
  });

  const glowIntensity = hovered ? look.glowIntensity + 0.8 : look.glowIntensity;
  const cushionLift = hovered || allocated ? look.lift + 0.15 : look.lift;

  return (
    <group position={[table.x, 0, table.z]}>
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
        <StateGlow
          radius={Math.max(table.halfWidth, table.halfDepth) + 0.54}
          colour={look.glow}
          intensity={glowIntensity}
        />

        {table.round ? (
          <RoundTable radius={table.halfWidth} />
        ) : (
          <RectTable halfWidth={table.halfWidth} halfDepth={table.halfDepth} />
        )}

        {seats.map((seat, index) => (
          <group key={index} position={[seat.x, 0, seat.z]} rotation={[0, seat.rotation, 0]}>
            <Chair
              upholstery={look.upholstery}
              emissive={look.emissive}
              emissiveIntensity={cushionLift}
            />
          </group>
        ))}
      </group>
    </group>
  );
}

/** The room: floor, grid, and every setting. */
function Room({ tables, freeTableIds, allocatedTableId, onHover }) {
  const placed = useMemo(() => layout(tables), [tables]);
  const spin = useRef();
  const { size } = useThree();

  const extentX = Math.max(...placed.map((t) => Math.abs(t.x))) + 1.35;
  const extentZ = Math.max(...placed.map((t) => Math.abs(t.z))) + 1.35;
  const span = Math.max(extentX, extentZ);

  useFrame((state, delta) => {
    if (!spin.current) return;

    spin.current.rotation.y += delta * 0.1;

    // Lean toward the pointer, clamped so the plan stays legible.
    const targetX = -state.pointer.y * 0.16;
    const targetZ = state.pointer.x * 0.05;

    spin.current.rotation.x += (targetX - spin.current.rotation.x) * Math.min(1, delta * 3);
    spin.current.rotation.z += (targetZ - spin.current.rotation.z) * Math.min(1, delta * 3);
  });

  const stateOf = (table) => {
    if (table.id === allocatedTableId) return 'allocated';
    if (freeTableIds === null) return 'neutral';
    return freeTableIds.includes(table.id) ? 'free' : 'taken';
  };

  // The room turns, so what must fit the frame is its rotating bounding circle,
  // not its width. Looking down at ~40° also foreshortens depth, hence the
  // generous factor rather than a strict 1:1 fit.
  const breathing = size.width < 640 ? 3.1 : 3.7;
  const fit = breathing / (span * Math.SQRT2);

  return (
    <group ref={spin} scale={fit}>
      <Float speed={1} rotationIntensity={0.04} floatIntensity={0.16}>
        {/* Floor slab. Corner radius stays under half the 0.14 thickness. */}
        <RoundedBox
          args={[span * 2, 0.14, span * 2]}
          radius={0.06}
          smoothness={4}
          position={[0, -0.075, 0]}
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.floor} metalness={0.15} roughness={0.6} />
        </RoundedBox>

        <gridHelper args={[span * 2, 12, PALETTE.grid, PALETTE.grid]} position={[0, 0.002, 0]}>
          <lineBasicMaterial attach="material" transparent opacity={0.3} />
        </gridHelper>

        {placed.map((table) => (
          <Setting key={table.id} table={table} state={stateOf(table)} onHover={onHover} />
        ))}

        <ContactShadows
          position={[0, 0.012, 0]}
          opacity={0.62}
          scale={span * 2.6}
          blur={2.2}
          far={2}
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
        camera={{ position: [0, 4.4, 6.6], fov: 36 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/*
          Candlelit, not daylit: ambient stays low so the pools of light around
          each setting read as light rather than washing into flat fill, and
          the overhead spot remains the dominant source.
        */}
        <ambientLight intensity={0.32} color="#4a3826" />
        <hemisphereLight args={['#7a5c38', '#0d0a06', 0.32]} />
        <directionalLight
          position={[4.5, 8, 3.5]}
          intensity={1.7}
          color="#ffd08a"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={1}
          shadow-camera-far={24}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={9}
          shadow-camera-bottom={-9}
        />
        <pointLight position={[-4.5, 3.2, -3.5]} intensity={30} color="#c9793a" distance={16} />
        <pointLight position={[3.5, 2.6, 4.5]} intensity={28} color="#e8a34a" distance={14} />
        <spotLight
          position={[0, 8, 0.5]}
          angle={0.72}
          penumbra={0.9}
          intensity={72}
          color="#ffd9a0"
          distance={20}
        />

        <Room
          tables={tables}
          freeTableIds={freeTableIds}
          allocatedTableId={allocatedTableId}
          onHover={setHovered}
        />

        {/*
          Post-processing gets its own Suspense boundary.

          Sharing one with the room meant that while the effect pipeline
          resolved — or if it never resolved — the room stayed unmounted and
          the canvas rendered nothing at all. The scene must never wait on its
          own polish.

          Bloom and vignette only: N8AO needs a normal pass, and that pipeline
          rendered this scene black. Contact shadows already supply the
          grounding ambient occlusion would have added.
        */}
        <Suspense fallback={null}>
          <EffectComposer multisampling={0}>
            <Bloom
              intensity={0.9}
              luminanceThreshold={0.4}
              luminanceSmoothing={0.32}
              mipmapBlur
            />
            <Vignette offset={0.32} darkness={0.5} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      {/* Hover read-out, in the service-sheet voice. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <p
          className={`font-mono text-[11px] tracking-[0.14em] uppercase transition-opacity duration-200 ${
            hovered ? 'text-brass opacity-100' : 'opacity-0'
          }`}
        >
          {hovered ? `Table ${hovered.label} · ${hovered.seats} covers` : '—'}
        </p>
      </div>
    </div>
  );
}
