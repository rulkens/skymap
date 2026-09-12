import type { MeshBody } from '../../@types/scene/MeshBody';
import { meshBody, type MeshBodySeed } from './makers/meshBody';

/**
 * SCENE_MESH_BODIES — seeded mesh-drawn bodies (the fifth `SceneBody` arm).
 * The seeds carry identity and per-body dials: `radiusM` and `albedo` are
 * joined in from `MESH_ASSETS`, so the baked asset stays their single source of
 * truth and a re-bake never needs an edit here. Positions ride the position
 * drivers (`ORBITAL_ELEMENTS` or `SURFACE_FIXED_SITES`), orientation
 * `ROTATION_ELEMENTS`, all keyed on these ids.
 */
const SEED_MESH_BODIES: readonly MeshBodySeed[] = [
  {
    id: 'whale',
    label: 'Whale',
    meshKey: 'whale',
    captionRevealM: 300,
  },
  {
    id: 'petunias',
    label: 'Bowl of Petunias',
    meshKey: 'petunias',
    captionRevealM: 60,
  },
  // The two Voyagers and the four Mars rovers. No `captionRevealM`: these are
  // real objects on the default caption reach, not easter eggs to stumble on.
  // Half a radius: the 13 m magnetometer boom sets the bounding sphere, so two
  // radii would park the camera 29 m from a 4 m bus.
  { id: 'voyager1', label: 'Voyager 1', meshKey: 'voyager', standoffRadii: 0.5 },
  { id: 'voyager2', label: 'Voyager 2', meshKey: 'voyager', standoffRadii: 0.5 },
  { id: 'curiosity', label: 'Curiosity', meshKey: 'curiosity' },
  { id: 'perseverance', label: 'Perseverance', meshKey: 'perseverance' },
  { id: 'spirit', label: 'Spirit', meshKey: 'mer' },
  { id: 'opportunity', label: 'Opportunity', meshKey: 'mer' },
];

export const SCENE_MESH_BODIES: readonly MeshBody[] = SEED_MESH_BODIES.map(meshBody);
