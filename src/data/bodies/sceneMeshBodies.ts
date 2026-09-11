import type { MeshBody } from '../../@types/scene/MeshBody';
import { meshBody, type MeshBodySeed } from './makers/meshBody';

/**
 * SCENE_MESH_BODIES — seeded mesh-drawn bodies (the fifth `SceneBody` arm).
 * The seeds carry identity only: `radiusM` and `albedo` are joined in from
 * `MESH_ASSETS`, so the baked asset stays their single source of truth and a
 * re-bake never needs an edit here. Positions ride `ORBITAL_ELEMENTS`,
 * orientation `ROTATION_ELEMENTS`, both keyed on these ids.
 */
const SEED_MESH_BODIES: readonly MeshBodySeed[] = [
  {
    id: 'whale',
    label: 'Whale',
    meshKey: 'whale',
  },
  {
    id: 'petunias',
    label: 'Bowl of Petunias',
    meshKey: 'petunias',
  },
];

export const SCENE_MESH_BODIES: readonly MeshBody[] = SEED_MESH_BODIES.map(meshBody);
