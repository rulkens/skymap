/**
 * regimeArmFor — the regime predicate (spec §4, §12-R2): a pure geometric
 * read, never a stored flag. `camera.base.frame` (a `PoseFrame`) IS the
 * regime, so hysteresis falls out of `current` alone — from `'absolute'` the
 * test is `min(h/R) < engageHR`, from a body arm it is `h/R > disengageHR`
 * for THAT body only, never the roster-wide minimum. The roster is body-blind
 * — every `SCENE_BODIES` row present in `bodyStates`, Sun and Sgr A* included
 * — so nothing here reads focus, the drag mode, or a render path.
 *
 * `h = |eye − body| − R` is eye-based (FW-A), never pivot-derived, and reuses
 * `bodyRelativePose` — spec §10's one permitted Mpc↔metre seam for the
 * engaged camera path — rather than importing `MPC_TO_M`/`M_TO_MPC` again
 * here; the basis argument is discarded, so any orthonormal matrix works.
 */

import type { PoseFrame } from '../../../@types/camera/PoseFrame';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { SURFACE_REGIME } from '../../../data/camera/surfaceRegime';
import { IDENTITY_MAT3 } from '../../../utils/math/identityMat3';
import { bodyRelativePose } from './bodyRelativePose';

/** Exported for the camera debug readout (`cameraDebugSnapshotOf`), the one other h/R reader. */
export function hOverR(eyeMpc: Readonly<Vec3>, bodyState: BodyState, radiusM: number): number {
  const { eyeRelBodyM } = bodyRelativePose({
    camPosMpc: eyeMpc,
    camBasisWorld: IDENTITY_MAT3,
    bodyState,
  });
  const distanceM = Math.hypot(eyeRelBodyM[0], eyeRelBodyM[1], eyeRelBodyM[2]);
  return (distanceM - radiusM) / radiusM;
}

export function regimeArmFor(
  current: PoseFrame,
  eyeMpc: Readonly<Vec3>,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
): PoseFrame {
  let nearestId: BodyId | null = null;
  let nearestHR = Infinity;
  let currentHR: number | null = null;

  for (const body of SCENE_BODIES) {
    const bodyId = body.id as BodyId;
    const bodyState = bodyStates.get(bodyId);
    if (bodyState === undefined) continue;

    const hr = hOverR(eyeMpc, bodyState, body.radiusM);
    if (hr < nearestHR) {
      nearestHR = hr;
      nearestId = bodyId;
    }
    if (current !== 'absolute' && current.body === bodyId) currentHR = hr;
  }

  if (current === 'absolute') {
    return nearestId !== null && nearestHR < SURFACE_REGIME.engageHR
      ? { body: nearestId }
      : 'absolute';
  }

  // The engaged body dropped out of the roster (unresolved this frame): hold
  // rather than guess — the caller's next frame retries once it resolves.
  if (currentHR === null) return current;
  return currentHR > SURFACE_REGIME.disengageHR ? 'absolute' : current;
}
