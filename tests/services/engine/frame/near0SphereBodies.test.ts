import { describe, expect, it } from 'vitest';

import { near0SphereBodies } from '../../../../src/services/engine/frame/near0SphereBodies';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { positionedBodiesOf } from '../../../helpers/frame/positionedBodiesOf';
import type { SceneBody } from '../../../../src/@types/scene/SceneBody';

const byId = (bodies: readonly SceneBody[], id: string): SceneBody =>
  bodies.find((body) => body.id === id)!;

// A craft or scene leaking into NEAR0's spheres would pull its near plane in to the mesh.
describe('near0SphereBodies', () => {
  it('drops every resolved mesh body, whichever Layer draws it', () => {
    const star = SCENE_STARS[0]!;
    const resolved = positionedBodiesOf([
      byId(SCENE_PLANETS, 'mars'),
      byId(SCENE_MESH_BODIES, 'curiosity'),
      byId(SCENE_MESH_BODIES, 'soendermarken'),
      star,
    ]).map((sphere) => ({ ...sphere, positionMpc: [0, 0, 0] as const }));

    const kept = near0SphereBodies(resolved, SCENE_MESH_BODIES).map(({ body }) => body.id);

    expect(kept).toEqual([star.id]);
  });
});
