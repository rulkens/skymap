import { SCALE_UNITS } from '../../data/scaleUnits';
import { ATMOSPHERE_PARAMS } from '../../data/bodies/atmosphereParams';
import { SCENE_RINGS } from '../../data/bodies/sceneRings';
import { BODY_DRAW_ENVELOPES } from '../../data/bodies/bodyDrawEnvelopes';
import type { SceneBody } from '../../@types/scene/SceneBody';
import { bodyFootprintRadiusM } from './bodyFootprintRadiusM';

/**
 * bodyDrawRadiusM — the body's outermost drawn shell, in metres:
 * `bodyFootprintRadiusM`, or the top of whichever optional shell (atmosphere,
 * cloud deck, ring, or a `BODY_DRAW_ENVELOPES` row) reaches further out.
 * `deriveSlabs` uses this for both a slab's near plane and its painter-sort
 * interval, so the two cannot disagree about the body's drawn footprint.
 * `ATMOSPHERE_PARAMS`/`RingSpec` stay km-native by design (their WGSL structs
 * are km); converted here with `SCALE_UNITS.KM_TO_M`.
 */
export function bodyDrawRadiusM(body: SceneBody): number {
  const footprintM = bodyFootprintRadiusM(body);
  let radiusM = footprintM;

  const atmosphere = ATMOSPHERE_PARAMS[body.id];
  if (atmosphere !== undefined) {
    radiusM = Math.max(radiusM, atmosphere.atmosphereTopKm * SCALE_UNITS.KM_TO_M);
  }

  const envelope = BODY_DRAW_ENVELOPES[body.id];
  if (envelope !== undefined) {
    radiusM = Math.max(radiusM, envelope(footprintM));
  }

  const ring = SCENE_RINGS.find((row) => row.bodyId === body.id);
  if (ring !== undefined) {
    radiusM = Math.max(radiusM, ring.outerRadiusKm * SCALE_UNITS.KM_TO_M);
  }

  return radiusM;
}
