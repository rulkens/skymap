/**
 * surfaceFollowCorotation — the ONE correction surface-fixed follow derives:
 *
 *     R̃(t) = O_body(t) · O_body(t₀)⁻¹        (`orientationWorldDelta`)
 *
 * A pure function of `simDays` and the single engage snapshot — no accumulated
 * history to drift, no frame order to get wrong. `runFrame`'s surface-follow
 * block is the resolution point and owns the rest of the contract (spec §4.6).
 *
 * `null` means identity: disengaged, or the snapshot's body has left the derive
 * map. Keyed on `surfaceFollow.bodyId`, NOT the live focus row — on the frame a
 * focus switch leaves engagement, the correction to fold out belongs to the
 * body being left behind.
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
