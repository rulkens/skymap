/**
 * The ONE producer of a legal `CameraTuning`: range-clamp each patched knob,
 * then settle the cross-edge invariants — each band's release edge ≥ its engage
 * edge × 1.1, tiltZeroHR ≥ tiltFullHR × 1.1, tiltZeroHR ≤ disengageHR. The knob
 * the caller moved wins and the other yields, EXCEPT against that last cap: the
 * arm flips at disengage, so the blend must already be at scene up there.
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

  let siteEngageR =
    patch.siteEngageR === undefined
      ? prev.siteEngageR
      : Math.min(L.siteEngageMax, Math.max(L.siteEngageMin, patch.siteEngageR));
  let siteDisengageR =
    patch.siteDisengageR === undefined
      ? prev.siteDisengageR
      : Math.min(L.siteDisengageMax, Math.max(L.siteDisengageMin, patch.siteDisengageR));
  if (siteDisengageR < siteEngageR * L.minRatio) {
    if (patch.siteDisengageR !== undefined && patch.siteEngageR === undefined) {
      siteEngageR = Math.max(L.siteEngageMin, siteDisengageR / L.minRatio);
    } else {
      siteDisengageR = Math.min(L.siteDisengageMax, siteEngageR * L.minRatio);
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
    siteEngageR,
    siteDisengageR,
    tiltFullHR,
    tiltZeroHR,
    blendSpace: patch.blendSpace ?? prev.blendSpace,
    northUp: patch.northUp ?? prev.northUp,
  };
}
