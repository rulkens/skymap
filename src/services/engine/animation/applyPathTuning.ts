/**
 * applyPathTuning — bake the clip-path inspector's live tuning (`align`,
 * `rampSec`, `linger`) into a clip's `flyPath` nodes.
 *
 * This is a pure pre-pass over the effect tree, in the same family as
 * `resolveClipFoci`: the inspector applies it at "Calculate" time so the SAMPLED
 * snapshot AND the pinned clip both carry the slider values — and because replay
 * runs the pinned clip through the ordinary `playClip`, the flown route is tuned
 * too, with no special compile path. Real clip / tour playback never calls this,
 * so authored clips keep their declared envelope; tuning is confined to the
 * inspector's sandbox.
 *
 * Every knob is OPTIONAL: only the fields present in `tuning` overwrite the
 * matching flyPath field, and an absent field leaves the clip's authored value
 * untouched. The inspector passes only the knobs the curator has activated, so a
 * clip Calculated with no slider touched previews its REAL authored pacing rather
 * than the inspector's seeded defaults. `rampSec: 0` is an ordinary value (use
 * the named `ease`), not a sentinel — absence, not zero, means "don't override".
 * Recurses through `seq` / `all` / `fork`; non-flyPath effects pass through
 * untouched, so a clip with no flyPath is unchanged. An empty `tuning` is a no-op.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { Effect } from '../../../@types/animation/Effect';
import type { SplineMode } from '../../../@types/animation/SplineMode';

export type PathTuning = {
  /** Align-in seconds (start-aim blend window). Omit to keep the clip's value. */
  readonly align?: number;
  /** Seconds of ease ramp each end (0 = use the named `ease`). Omit to keep the clip's value. */
  readonly rampSec?: number;
  /** Per-target brake depth ∈ [0,1] (0 = cruise straight through). Omit to keep the clip's value. */
  readonly linger?: number;
  /** Spline basis (centripetal Catmull-Rom ↔ causal Hermite). Omit to keep the clip's value. */
  readonly spline?: SplineMode;
  /** Causal-Hermite turn-delay magnitude. Omit to keep the clip's value. */
  readonly turnDelay?: number;
  /** Seconds the look leads the eye along the path. Omit to keep the clip's value. */
  readonly lookAhead?: number;
};

function tuneEffect(effect: Effect, tuning: PathTuning): Effect {
  switch (effect.kind) {
    case 'flyPath':
      return {
        ...effect,
        ...(tuning.align !== undefined ? { align: tuning.align } : {}),
        ...(tuning.rampSec !== undefined ? { rampSec: tuning.rampSec } : {}),
        ...(tuning.linger !== undefined ? { linger: tuning.linger } : {}),
        ...(tuning.spline !== undefined ? { spline: tuning.spline } : {}),
        ...(tuning.turnDelay !== undefined ? { turnDelay: tuning.turnDelay } : {}),
        ...(tuning.lookAhead !== undefined ? { lookAhead: tuning.lookAhead } : {}),
      };
    case 'seq':
    case 'all':
      return { ...effect, children: effect.children.map((c) => tuneEffect(c, tuning)) };
    case 'fork':
      return { ...effect, child: tuneEffect(effect.child, tuning) };
    default:
      return effect;
  }
}

export function applyPathTuning(clip: ClipData, tuning: PathTuning): ClipData {
  return { ...clip, timeline: clip.timeline.map((e) => tuneEffect(e, tuning)) };
}
