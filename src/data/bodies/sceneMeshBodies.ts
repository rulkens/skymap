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
    description:
      "A sperm whale, called into existence 400 km above the Earth by an Infinite Improbability Drive and left to work out what it was. In Douglas Adams' telling it had just long enough to name the wind before meeting the ground; here it keeps the view and skips the landing.",
  },
  {
    id: 'petunias',
    label: 'Bowl of Petunias',
    meshKey: 'petunias',
    description:
      'The bowl of petunias that appeared alongside the whale, and whose only thought on the way down was "Oh no, not again." It trails the whale by about forty metres around the same orbit.',
  },
];

export const SCENE_MESH_BODIES: readonly MeshBody[] = SEED_MESH_BODIES.map(meshBody);
