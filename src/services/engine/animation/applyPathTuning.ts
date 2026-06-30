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
 * Both knobs are concrete seconds and always overwrite the matching flyPath
 * field — the inspector store seeds them from the flyPath defaults, so a fresh
 * inspect re-applies those same values (a no-op) and dragging a slider overrides
 * for the preview + replay. `rampSec: 0` is an ordinary value (use the named
 * `ease`), not a sentinel. Recurses through `seq` / `all` / `fork`; non-flyPath
 * effects pass through untouched, so a clip with no flyPath is unchanged.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { Effect } from '../../../@types/animation/Effect';

export type PathTuning = {
  /** Align-in seconds (start-aim blend window). */
  readonly align: number;
  /** Seconds of ease ramp each end (0 = use the named `ease`). */
  readonly rampSec: number;
  /** Per-target brake depth ∈ [0,1] (0 = cruise straight through). */
  readonly linger: number;
};

function tuneEffect(effect: Effect, tuning: PathTuning): Effect {
  switch (effect.kind) {
    case 'flyPath':
      return { ...effect, align: tuning.align, rampSec: tuning.rampSec, linger: tuning.linger };
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
