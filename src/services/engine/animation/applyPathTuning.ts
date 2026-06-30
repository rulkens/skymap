/**
 * applyPathTuning — bake the clip-path inspector's live tuning (`align`,
 * `rampSec`) into a clip's `flyPath` nodes.
 *
 * This is a pure pre-pass over the effect tree, in the same family as
 * `resolveClipFoci`: the inspector applies it at "Calculate" time so the SAMPLED
 * snapshot AND the pinned clip both carry the slider values — and because replay
 * runs the pinned clip through the ordinary `playClip`, the flown route is tuned
 * too, with no special compile path. Real clip / tour playback never calls this,
 * so authored clips keep their declared envelope; tuning is confined to the
 * inspector's sandbox.
 *
 * Every `flyPath` leaf (recursively through `seq` / `all` / `fork`) gets its
 * `align` overwritten with the current tuning, and its `rampSec` overwritten
 * only when `rampSec > 0` — a 0 means "leave the clip's authored ease", so the
 * inspector can preview a path faithfully before the ramp is touched. Non-flyPath
 * effects pass through untouched, so a clip with no flyPath is returned
 * structurally unchanged.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { Effect } from '../../../@types/animation/Effect';

export type PathTuning = {
  /** Align-in seconds (the start-aim blend window). */
  readonly align: number;
  /** Seconds of ease ramp each end; 0 = leave the clip's authored ease. */
  readonly rampSec: number;
};

function tuneEffect(effect: Effect, tuning: PathTuning): Effect {
  switch (effect.kind) {
    case 'flyPath':
      return {
        ...effect,
        align: tuning.align,
        ...(tuning.rampSec > 0 ? { rampSec: tuning.rampSec } : {}),
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
