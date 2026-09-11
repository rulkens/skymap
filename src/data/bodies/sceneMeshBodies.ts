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
      "Ah … ! What's happening? it thought. Er, excuse me, who am I? Hello? Why am I here? What's my purpose in life? … And wow! Hey! What's this thing suddenly coming towards me very fast? So big and flat and round, it needs a big wide sounding name like … ow … ound … round … ground! That's it! That's a good name – ground! I wonder if it will be friends with me? — Douglas Adams, The Hitchhiker's Guide to the Galaxy, ch. 18",
  },
  {
    id: 'petunias',
    label: 'Bowl of Petunias',
    meshKey: 'petunias',
    description:
      "Curiously enough, the only thing that went through the mind of the bowl of petunias as it fell was Oh no, not again. Many people have speculated that if we knew exactly why the bowl of petunias had thought that we would know a lot more about the nature of the Universe than we do now. — Douglas Adams, The Hitchhiker's Guide to the Galaxy, ch. 18",
  },
];

export const SCENE_MESH_BODIES: readonly MeshBody[] = SEED_MESH_BODIES.map(meshBody);
