import { SCALE_UNITS } from '../../data/scaleUnits';
import { ATMOSPHERE_PARAMS } from '../../data/bodies/atmosphereParams';
import { CLOUD_SHELL_PARAMS } from '../../data/bodies/cloudShellParams';
import { SCENE_RINGS } from '../../data/bodies/sceneRings';
import type { SceneBody } from '../../@types/scene/SceneBody';

/**
 * bodyDrawRadiusM — the body's outermost drawn shell, in metres: `radiusM`, or
 * the top of whichever optional shell (atmosphere, cloud deck, ring) reaches
 * further out. `deriveSlabs` (Task 4) uses this for both a slab's near plane
 * and its painter-sort interval, so the two cannot disagree about the body's
 * drawn footprint. `ATMOSPHERE_PARAMS`/`RingSpec` stay km-native by design
 * (their WGSL structs are km); converted here with `SCALE_UNITS.KM_TO_M`.
 */
export function bodyDrawRadiusM(body: SceneBody): number {
  let radiusM = body.radiusM;

  const atmosphere = ATMOSPHERE_PARAMS[body.id];
  if (atmosphere !== undefined) {
    radiusM = Math.max(radiusM, atmosphere.atmosphereTopKm * SCALE_UNITS.KM_TO_M);
  }

  // Cloud shell has no per-body registry row (Earth is its only consumer today,
  // hardcoded the same way in cloudShellLayer.ts/earthLayer.ts).
  if (body.id === 'earth') {
    radiusM = Math.max(radiusM, body.radiusM * CLOUD_SHELL_PARAMS.radiusRatio);
  }

  const ring = SCENE_RINGS.find((row) => row.bodyId === body.id);
  if (ring !== undefined) {
    radiusM = Math.max(radiusM, ring.outerRadiusKm * SCALE_UNITS.KM_TO_M);
  }

  return radiusM;
}
