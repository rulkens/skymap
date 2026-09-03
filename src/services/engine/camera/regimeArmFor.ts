/**
 * regimeArmFor — the regime predicate (spec §4, §12-R2, round 10): a pure
 * read of geometry AND focus, never a stored flag. A body arm needs BOTH
 * conditions: the focus one — a BODY focus must name the nearest/engaged
 * body; a differing body focus releases the arm and symmetrically blocks
 * engage, since an arm the fold would release next frame must never be
 * entered (the alternative: a flip committed every frame until the follow
 * ease escapes the band) — and the altitude one, where `camera.base.frame`
 * IS the regime, so hysteresis falls out of `current` alone: from
 * `'absolute'` the test is `min(h/R) < engageHR`, from a body arm it is
 * `h/R > disengageHR` for THAT body only, never the roster-wide minimum.
 * Only with a null or non-body focus is the predicate body-blind, per
 * `nearestBodyHR`'s roster rule (shared with the approach alignment).
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
    // Clip/tour reachability (R10-1): guided flight cannot trip the focus
    // gate — `flyAndFocusOnClip` lands its focus cue at beat start, aligned
    // with the destination — but a hand-authored `flyToClip`/`flyPath` CAN
    // park at another body's surface with a stale body focus; no engage
    // happens there, so the first at-rest frame's pivot pin re-targets the
    // FOCUSED body and the camera leaves for it (demonstrated in
    // focusReleaseWhileEngaged.test.ts; pre-round-10 the focus-blind engage
    // captured the parked-at body mid-approach, shielding it from the pin).
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
