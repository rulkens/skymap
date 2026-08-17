/**
 * ClipData — the serializable input to `compileClip`.
 *
 * A `ClipData` is the authored form of a camera+scene animation. It is a plain
 * serializable object (no functions, no class instances) that describes WHAT
 * should happen during a clip, not HOW to execute it. The `compileClip` function
 * (Task 4) flattens the effect tree into per-channel tracks for the evaluator.
 *
 * ### Fields
 *
 *   - `start`: the camera pose at the beginning of the clip. Two forms:
 *       - A concrete `CameraPose` — used directly as the clip's starting pose.
 *       - The literal `'live'` — the actual starting pose is resolved at
 *         `startClip` call time (the camera's current position). `compileClip`
 *         itself receives a resolved `CameraPose`; the `'live'` token is a
 *         runtime signal handled by the clip player (Task N), not the compiler.
 *       - `undefined` (absent) — treated the same as `'live'` by convention.
 *
 *   - `timeline`: the ordered array of `Effect` nodes that make up the clip.
 *     A `seq` of top-level effects is the most common form; nested `seq`/`all`/
 *     `fork` nodes allow arbitrary concurrency patterns. A clip that wants a
 *     lead-in — holding the start pose before anything happens — opens its
 *     timeline with a `wait(sec)`; there is no separate clip-level field for it,
 *     because a leading `wait` already shifts every following window by `sec`.
 *
 *   - `loop`: when true, `clipPlayer` rewinds the clock instead of ending the
 *     clip once elapsed reaches `durationSec` — see `clipPlayer.tick`'s
 *     completion arm. The clip then only ends via `stop()` (a `stopClip`
 *     dispatch or saga cancellation), never on its own. For the loop point to
 *     look seamless, author the timeline so `pose(durationSec) === pose(0)`
 *     (mod 2π on any spun angle channel) — the compiler does not verify this.
 *
 * ### Why `start?: CameraPose | 'live'` instead of always requiring a pose?
 *
 * A clip authored for a specific bookmark (e.g. the Virgo Cluster chapter) knows
 * its start pose statically — it can bake it in and be compiled offline. A clip
 * authored to "play from wherever the user is now" must capture the live camera
 * state at playback time. Separating the two prevents the compiler from being
 * called with a stale baked pose when the intent is dynamic, while still
 * allowing the compiler to emit a resolved `CompiledClip.start` in both cases
 * (defaulting to a zero pose for `'live'` until Task N resolves it).
 */

import type { CameraPose } from '../camera/CameraPose';
import type { Effect } from './Effect';

export type ClipData = {
  readonly start?: CameraPose | 'live';
  readonly timeline: Effect[];
  readonly loop?: boolean;
};
