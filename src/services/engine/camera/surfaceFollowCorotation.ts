/**
 * surfaceFollowCorotation — surface-fixed follow's ONE correction,
 * `R̃(t) = O_body(t) · O_body(t₀)⁻¹`; `null` is identity. A pure function of
 * `simDays` and the single engage snapshot, so no history can drift;
 * `runFrame`'s surface-follow block owns the contract (§4.6). Keyed on
 * `surfaceFollow.bodyId`, NOT the live focus row — a focus switch must fold out
 * the correction belonging to the body left behind.
 */

import { deriveBodyStates } from '../frame/deriveBodyStates';
import { orientationWorldDelta } from '../../../utils/camera/orientationWorldDelta';
import type { CameraRuntime } from '../../../@types/engine/state/CameraRuntime';
import type { Mat3 } from '../../../@types/math/Mat3';

export function surfaceFollowCorotation(
  surfaceFollow: CameraRuntime['surfaceFollow'],
  simDays: number,
): Mat3 | null {
  const { orientationAtEngage, bodyId } = surfaceFollow;
  if (orientationAtEngage === null || bodyId === null) return null;
  const bodyState = deriveBodyStates(simDays).get(bodyId);
  if (bodyState === undefined) return null;
  return orientationWorldDelta(orientationAtEngage, bodyState.orientation);
}
