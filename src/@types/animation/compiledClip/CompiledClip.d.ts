/**
 * CompiledClip — the output of `compileClip`; what the camera evaluator and the
 * clip player both read.
 *
 * `compileClip` walks a `ClipData` effect tree once and flattens it into three
 * families of per-channel tracks plus the scene's tracks. The evaluator then
 * processes these flat arrays each frame without re-traversing the tree; the
 * clip player evaluates `scene` at the clip clock (`sceneView`, `clipFactorAt`).
 *
 * ### Why flatten at all, instead of evaluating the tree directly?
 *
 * Walking the full effect tree each frame (or even each scrub point) would be
 * redundant work — the tree's structure never changes during playback. Flattening
 * once at registration time isolates the structural walk from the per-frame
 * evaluation loop, makes the evaluator's hot path branch-free (sorted arrays
 * rather than recursive dispatch), and enables the single-writer validation
 * (Task 5) to run over the compiled tracks rather than the raw tree.
 *
 * ### The three track families and one cue list
 *
 * Camera motion is modelled as three additive layers (spec §3):
 *   - **Base** (`baseTracks`): absolute-position tweens (`set`/`setVec`) and
 *     delta-spin segments (`spin`). Exactly one base writer per channel per
 *     overlapping window (enforced by `validateSingleWriter`, Task 5).
 *   - **Velocity** (`velTracks`): `rate` ramps that add a velocity offset to a
 *     channel; integrates in closed form, so scrubable.
 *   - **Oscillation** (`oscTracks`): zero-mean sine bobs (`osc`); perpetual,
 *     no window. Additive with both base and velocity.
 *
 * Scene effects (`show`/`hide`/`scene`/`frameTo` steps, `focus` steps, `fade`
 * factor segments) are evaluated at t as an overlay on intent, never dispatched;
 * they move what is drawn, not the camera, so they live outside the track families.
 *
 * ### Sub-shapes are private compile artifacts
 *
 * `BaseSegment`, `VelRamp`, `OscTrack`, `CompositeSample`, `CompositeTrack` and
 * the `SceneTracks` family (each in its own sibling file, per the one-type-per-file
 * convention) are internal representations produced by `compileClip` and
 * consumed only by the evaluator and the clip player. They
 * are NOT intended as independently useful public API — the `compiledClip/`
 * folder is what now marks them as one family, in place of the single shared
 * file that used to carry that meaning; their fields stay inseparable from
 * `CompiledClip` itself.
 */

import type { Channel } from '../Channel';
import type { CameraPose } from '../../camera/pose/CameraPose';
import type { BaseSegment } from './BaseSegment';
import type { VelRamp } from './VelRamp';
import type { OscTrack } from './OscTrack';
import type { CompositeTrack } from './CompositeTrack';
import type { SceneTracks } from './SceneTracks';
import type { EffectSpan } from '../EffectSpan';

/**
 * CompiledClip — the fully flattened, evaluator-ready form of a `ClipData`.
 *
 * Produced by `compileClip` from a `ClipData`. Consumed by the camera evaluator
 * and the clip player each frame.
 *
 * All times are in seconds relative to the clip's start. A leading `wait` in
 * the source timeline simply shifts the cursor, so `baseTracks`, `velTracks`,
 * `oscTracks`, and `scene` all carry those later absolute times directly.
 */
export type CompiledClip = {
  /** The concrete starting camera pose. `'live'` is resolved upstream before
   *  compileClip is called; if `start` was absent or `'live'`, a zero pose
   *  (target [0,0,0], yaw 0, pitch 0, distance 0) is used as a placeholder
   *  until the live-resolution task (Task N) is wired in. */
  readonly start: CameraPose;

  /** Total duration of the AWAITED (non-fork) effect tree, including any
   *  leading `wait` lead-in. Fork children do not contribute to this value. */
  readonly durationSec: number;

  /** Per-channel base segments, one entry per Channel (possibly empty array).
   *  Within each channel, segments are ordered by startSec ascending and
   *  overlap only as a blend pair (the later one carries `blendIn`). */
  readonly baseTracks: Record<Channel, BaseSegment[]>;

  /** Velocity ramps from `rate` actions, across all channels, in emission
   *  order. The evaluator filters by channel as needed. */
  readonly velTracks: VelRamp[];

  /** Oscillation tracks from `osc` actions, across all channels. The evaluator
   *  sums contributions per channel each frame. */
  readonly oscTracks: OscTrack[];

  /** The clip's scene as tracks, a pure function of the clip clock (`sceneView`, `clipFactorAt`). */
  readonly scene: SceneTracks;

  /** Composite writers (a `flyPath` each), each over its own window. The
   *  evaluator lets one supersede the base layer for the channels it declares;
   *  `validateCompositeExclusivity` forbids a base writer overlapping one there. */
  readonly compositeTracks: CompositeTrack[];

  /** One walk window per effect, pre-order (parent before children): the
   *  compiler's own timing, so an editor never re-derives it. */
  readonly spans: readonly EffectSpan[];
};
