/**
 * regimeArmFor — the regime predicate (spec §4, §12-R2): a pure geometric
 * read, never a stored flag. `camera.base.frame` (a `PoseFrame`) IS the
 * regime, so hysteresis falls out of `current` alone — from `'absolute'` the
 * test is `min(h/R) < engageHR`, from a body arm it is `h/R > disengageHR`
 * for THAT body only, never the roster-wide minimum. The roster rule (every
 * `SCENE_BODIES` row present in `bodyStates`, body-blind) lives in
 * `nearestBodyHR`, shared with the approach alignment.
 *
 * `focusedBodyId` (round 10): a focus on a DIFFERENT body is a disengage
 * condition — and symmetrically blocks engage — because a body arm the fold
 * would release next frame must never be entered (the alternative is an
 * engage/release flip committed every frame until the follow ease escapes
 * the band). Only a BODY focus constrains; null (no focus, or a star/
 * galaxy/structure focus) keeps the predicate body-blind as before.
 */

import type { PoseFrame } from '../../../@types/camera/PoseFrame';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { SURFACE_REGIME } from '../../../data/camera/surfaceRegime';
import { hOverR } from './hOverR';
import { nearestBodyHR } from './nearestBodyHR';

export function regimeArmFor(
  current: PoseFrame,
  eyeMpc: Readonly<Vec3>,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
  focusedBodyId: string | null,
): PoseFrame {
  if (current === 'absolute') {
    const nearest = nearestBodyHR(eyeMpc, bodyStates);
    return nearest !== null &&
      nearest.hr < SURFACE_REGIME.engageHR &&
      (focusedBodyId === null || focusedBodyId === nearest.bodyId)
      ? { body: nearest.bodyId }
      : 'absolute';
  }

  // The focused body owns the camera's intent: a differing body focus
  // releases the arm so followBody can take over next frame (the fold's
  // conversion + commit below the caller run untouched — one author).
  if (focusedBodyId !== null && focusedBodyId !== current.body) return 'absolute';

  // Disengage tests the ENGAGED body only. Dropped out of the roster
  // (unresolved this frame): hold rather than guess — the caller's next
  // frame retries once it resolves.
  const row = SCENE_BODIES.find((body) => body.id === current.body);
  const bodyState = bodyStates.get(current.body);
  if (row === undefined || bodyState === undefined) return current;
  return hOverR(eyeMpc, bodyState, row.radiusM) > SURFACE_REGIME.disengageHR ? 'absolute' : current;
}
