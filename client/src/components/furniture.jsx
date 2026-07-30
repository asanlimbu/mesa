/**
 * Dining room furniture.
 *
 * Real tables and chairs rather than coloured markers: a top, a base or legs,
 * and a chair per cover around the perimeter. Modelled from primitives instead
 * of loading a mesh, so there is no asset to download, no licence to clear, and
 * a full room stays a few hundred draw calls.
 *
 * Availability is carried by the upholstery and by a pool of light on the floor
 * beneath each setting — never by the tabletop. A bright green tabletop reads
 * as plastic; a lit floor reads as a room under lights.
 *
 * One constraint worth stating: a RoundedBox corner radius must stay under half
 * the smallest dimension. Larger and the geometry degenerates, and its NaN
 * bounding sphere takes the whole render down rather than just that mesh.
 */

import { RoundedBox, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

const WALNUT = { color: '#4a3524', roughness: 0.6, metalness: 0.05 };
const OAK = { color: '#664c34', roughness: 0.62, metalness: 0.05 };
const METAL = { color: '#1b1c1a', roughness: 0.35, metalness: 0.85 };

/** Everything stands on the floor plane, so the room shares one datum. */
export const TABLE_HEIGHT = 0.44;

/**
 * One chair: seat, back and two leg bars.
 *
 * Four meshes, because a busy venue holds sixty of them and a chair at this
 * scale reads from its silhouette rather than its joinery.
 */
export function Chair({ upholstery, emissive, emissiveIntensity }) {
  const cushion = (
    <meshStandardMaterial
      color={upholstery}
      emissive={new THREE.Color(emissive)}
      emissiveIntensity={emissiveIntensity}
      roughness={0.72}
      metalness={0.06}
    />
  );

  return (
    <group>
      {/* Seat */}
      <RoundedBox
        args={[0.21, 0.045, 0.21]}
        radius={0.014}
        smoothness={2}
        position={[0, 0.19, 0]}
        castShadow
      >
        {cushion}
      </RoundedBox>

      {/* Back */}
      <RoundedBox
        args={[0.21, 0.26, 0.045]}
        radius={0.016}
        smoothness={2}
        position={[0, 0.33, 0.087]}
        castShadow
      >
        {cushion}
      </RoundedBox>

      {/* Leg bars, front and back */}
      <RoundedBox args={[0.18, 0.18, 0.032]} radius={0.011} smoothness={2} position={[0, 0.09, -0.075]}>
        <meshStandardMaterial {...METAL} />
      </RoundedBox>
      <RoundedBox args={[0.18, 0.18, 0.032]} radius={0.011} smoothness={2} position={[0, 0.09, 0.075]}>
        <meshStandardMaterial {...METAL} />
      </RoundedBox>
    </group>
  );
}

/**
 * Where the covers sit.
 *
 * Chairs are spaced evenly around an ellipse circumscribing the table, so a
 * round two-top and a long six-top both get plausible spacing without a
 * bespoke layout per table size.
 */
export function seatPositions(count, halfWidth, halfDepth, gap = 0.32) {
  const rx = halfWidth + gap;
  const rz = halfDepth + gap;

  return Array.from({ length: count }, (_, index) => {
    // Offset a quarter turn so a two-top faces across the table, not along it.
    const angle = (index / count) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * rx;
    const z = Math.sin(angle) * rz;

    // Turn each chair to face the middle of its table.
    return { x, z, rotation: Math.atan2(-x, -z) };
  });
}

/** A round pedestal table — the two-tops and the big communal round. */
export function RoundTable({ radius }) {
  return (
    <group>
      {/* Top */}
      <Cylinder
        args={[radius, radius, 0.05, 48]}
        position={[0, TABLE_HEIGHT, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial {...OAK} />
      </Cylinder>

      {/* Apron, so the top has an edge rather than floating */}
      <Cylinder args={[radius * 0.96, radius * 0.93, 0.04, 40]} position={[0, TABLE_HEIGHT - 0.045, 0]}>
        <meshStandardMaterial {...WALNUT} />
      </Cylinder>

      {/* Column and foot */}
      <Cylinder args={[0.05, 0.065, 0.38, 20]} position={[0, 0.2, 0]} castShadow>
        <meshStandardMaterial {...METAL} />
      </Cylinder>
      <Cylinder args={[radius * 0.44, radius * 0.48, 0.03, 28]} position={[0, 0.015, 0]}>
        <meshStandardMaterial {...METAL} />
      </Cylinder>
    </group>
  );
}

/** A rectangular table on four legs — the fours and sixes. */
export function RectTable({ halfWidth, halfDepth }) {
  const inset = 0.08;
  const legs = [
    [halfWidth - inset, halfDepth - inset],
    [-(halfWidth - inset), halfDepth - inset],
    [halfWidth - inset, -(halfDepth - inset)],
    [-(halfWidth - inset), -(halfDepth - inset)],
  ];

  return (
    <group>
      <RoundedBox
        args={[halfWidth * 2, 0.055, halfDepth * 2]}
        radius={0.02}
        smoothness={3}
        position={[0, TABLE_HEIGHT, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial {...OAK} />
      </RoundedBox>

      <RoundedBox
        args={[halfWidth * 1.92, 0.05, halfDepth * 1.92]}
        radius={0.018}
        smoothness={2}
        position={[0, TABLE_HEIGHT - 0.048, 0]}
      >
        <meshStandardMaterial {...WALNUT} />
      </RoundedBox>

      {legs.map(([x, z]) => (
        <Cylinder key={`${x}:${z}`} args={[0.024, 0.028, 0.4, 12]} position={[x, 0.2, z]} castShadow>
          <meshStandardMaterial {...METAL} />
        </Cylinder>
      ))}
    </group>
  );
}

/**
 * The pool of light on the floor beneath a setting.
 *
 * This is what carries availability. Lying flat and emissive, it catches the
 * bloom pass and reads as lit floor rather than a coloured object.
 */
export function StateGlow({ radius, colour, intensity }) {
  return (
    <Cylinder args={[radius, radius, 0.008, 40]} position={[0, 0.006, 0]}>
      <meshStandardMaterial
        color={colour}
        emissive={new THREE.Color(colour)}
        emissiveIntensity={intensity}
        transparent
        opacity={0.75}
        toneMapped={false}
      />
    </Cylinder>
  );
}
