/**
 * The ONE producer of a legal `CameraTuning`: range-clamp each patched knob,
 * then settle the three cross-edge invariants. The knob the caller moved wins
 * and the other yields — except the `tiltZeroHR ≤ disengageHR` cap, which
 * outranks the caller, because the arm flips at disengage and the blend must
 * already be at scene up there (`engageFlipPop` guards the pop).
 */

import type { CameraTuning } from '../../@types/camera/CameraTuning';
import { CAMERA_TUNING_LIMITS } from '../../data/camera/cameraTuning';

export function clampCameraTuning(patch: Partial<CameraTuning>, prev: CameraTuning): CameraTuning {
  const L = CAMERA_TUNING_LIMITS;

  let engageHR =
    patch.engageHR === undefined
      ? prev.engageHR
      : Math.min(L.engageMax, Math.max(L.engageMin, patch.engageHR));
  let disengageHR =
    patch.disengageHR === undefined
      ? prev.disengageHR
      : Math.min(L.disengageMax, Math.max(L.disengageMin, patch.disengageHR));
  if (disengageHR < engageHR * L.minRatio) {
    if (patch.disengageHR !== undefined && patch.engageHR === undefined) {
      engageHR = Math.max(L.engageMin, disengageHR / L.minRatio);
    } else {
      disengageHR = Math.min(L.disengageMax, engageHR * L.minRatio);
    }
  }

  let tiltFullHR =
    patch.tiltFullHR === undefined
      ? prev.tiltFullHR
      : Math.min(L.tiltFullMax, Math.max(L.tiltFullMin, patch.tiltFullHR));
  const cap = Math.min(L.tiltZeroMax, disengageHR);
  let tiltZeroHR = Math.min(
    cap,
    patch.tiltZeroHR === undefined
      ? prev.tiltZeroHR
      : Math.min(L.tiltZeroMax, Math.max(L.tiltZeroMin, patch.tiltZeroHR)),
  );
  if (tiltZeroHR < tiltFullHR * L.minRatio) {
    const raised = tiltFullHR * L.minRatio;
    if (patch.tiltFullHR !== undefined && raised <= cap) {
      tiltZeroHR = raised;
    } else {
      tiltFullHR = Math.max(L.tiltFullMin, tiltZeroHR / L.minRatio);
    }
  }

  return {
    engageHR,
    disengageHR,
    tiltFullHR,
    tiltZeroHR,
    blendSpace: patch.blendSpace ?? prev.blendSpace,
    northUp: patch.northUp ?? prev.northUp,
  };
}
