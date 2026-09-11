/**
 * meshBody — row maker for a `MeshBody`: joins an authored seed (id/label/
 * meshKey) against `MESH_ASSETS`, the tool-generated table
 * (`npm run build-meshes`). `radiusM`/`albedo` come ONLY from the generated
 * row — never re-authored at the seed site — so the baked asset stays the
 * single source of truth for both. Throws at the call site on a miss, same
 * posture as `findByIdOrThrow`: a typo'd `meshKey`, or a seed added before
 * its asset landed, must fail loudly there rather than seed a body with
 * `undefined` geometry that only misbehaves at render time.
 */

import { MESH_ASSETS } from '../meshAssets.generated';
import type { MeshBody } from '../../../@types/scene/MeshBody';

/** Camera floor at two radii: the body fills the view. A ratio, not metres, so the 0.46 m pot and the 6.8 m whale both frame. */
const MESH_BODY_STANDOFF_RADII = 2;

export type MeshBodySeed = {
  readonly id: string;
  readonly label: string;
  readonly meshKey: string;
};

export function meshBody(seed: MeshBodySeed): MeshBody {
  const asset = MESH_ASSETS[seed.meshKey];
  if (!asset) throw new Error(`meshBody: no MESH_ASSETS entry for meshKey '${seed.meshKey}'`);
  return {
    id: seed.id,
    label: seed.label,
    meshKey: seed.meshKey,
    radiusM: asset.boundingRadiusM,
    albedo: asset.meanAlbedo,
    standoffRadii: MESH_BODY_STANDOFF_RADII,
  };
}
