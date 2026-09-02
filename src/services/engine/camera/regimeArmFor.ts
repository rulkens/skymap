/**
 * regimeArmFor — the regime predicate (spec §4, §12-R2): a pure geometric
 * read, never a stored flag. `camera.base.frame` (a `PoseFrame`) IS the
 * regime, so hysteresis falls out of `current` alone — from `'absolute'` the
 * test is `min(h/R) < engageHR`, from a body arm it is `h/R > disengageHR`
 * for THAT body only, never the roster-wide minimum. The roster rule (every
 * `SCENE_BODIES` row present in `bodyStates`, body-blind, focus never
 * consulted) lives in `nearestBodyHR`, shared with the approach alignment.
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
): PoseFrame {
  if (current === 'absolute') {
    const nearest = nearestBodyHR(eyeMpc, bodyStates);
    return nearest !== null && nearest.hr < SURFACE_REGIME.engageHR
      ? { body: nearest.bodyId }
      : 'absolute';
  }

  // Disengage tests the ENGAGED body only. Dropped out of the roster
  // (unresolved this frame): hold rather than guess — the caller's next
  // frame retries once it resolves.
  const row = SCENE_BODIES.find((body) => body.id === current.body);
  const bodyState = bodyStates.get(current.body);
  if (row === undefined || bodyState === undefined) return current;
  return hOverR(eyeMpc, bodyState, row.radiusM) > SURFACE_REGIME.disengageHR ? 'absolute' : current;
}
