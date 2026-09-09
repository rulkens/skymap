/**
 * regimeArmFor — the regime predicate (spec §4, §12-R2, round 10): a pure read of
 * geometry AND focus, never a stored flag. `camera.base.frame` IS the regime, so
 * hysteresis falls out of `current`: from `'absolute'` the test is
 * `min(h/R) < engageHR`, from a body arm `h/R > disengageHR` for THAT body only.
 * A differing BODY focus both releases the arm and blocks engage — an arm the fold
 * would release next frame must never be entered.
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
    // Clip/tour reachability (R10-1): a hand-authored `flyToClip` CAN park at one
    // body's surface with a stale focus on another. No engage happens there, so
    // the first at-rest frame's pivot pin re-targets the FOCUSED body.
    return nearest !== null &&
      nearest.hr < SURFACE_REGIME.engageHR &&
      (focusedBodyId === null || focusedBodyId === nearest.bodyId)
      ? { body: nearest.bodyId }
      : 'absolute';
  }

  // A differing body focus releases the arm so followBody can take over next frame.
  if (focusedBodyId !== null && focusedBodyId !== current.body) return 'absolute';

  // Unresolved this frame: hold rather than guess — the caller's next frame retries.
  const row = SCENE_BODIES.find((body) => body.id === current.body);
  const bodyState = bodyStates.get(current.body);
  if (row === undefined || bodyState === undefined) return current;
  return hOverR(eyeMpc, bodyState, row.radiusM) > SURFACE_REGIME.disengageHR ? 'absolute' : current;
}
