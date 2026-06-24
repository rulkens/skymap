/**
 * CompiledClip — the output of `compileClip`; what the evaluator and cue-firer
 * both read.
 *
 * `compileClip` walks a `ClipData` effect tree once and flattens it into three
 * families of per-channel tracks plus a time-ordered cue list. The evaluator
 * (Task 6) then processes these flat arrays each frame without re-traversing the
 * tree; the cue-firer scans `cues` linearly as the clock advances.
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
 * Scene effects (`show`/`hide`/`fade`/`scene`/`focus`) are one-shot cues fired
 * when the playback clock crosses their `atSec`; they do not drive frame-level
 * interpolation, so they live outside the track families.
 *
 * ### Sub-shapes are private compile artifacts
 *
 * `BaseSegment`, `VelRamp`, `OscTrack`, and `SceneCue` are co-located here
 * intentionally: they are internal representations produced by `compileClip` and
 * consumed only by the evaluator (Task 6) and the cue-firer (Task 7). They are
 * NOT intended as independently useful public API. The one-type-per-file
 * convention in `src/@types/` applies to PUBLIC types; these are compiler
 * artifacts whose meaning is inseparable from `CompiledClip` itself.
 */

import type { Channel } from './Channel';
import type { Ease } from './Ease';
import type { Space } from './Space';
import type { SceneEffect } from './SceneEffect';
import type { CameraPose } from '../camera/CameraPose';
import type { Vec3 } from '../math/Vec3';

// ---------------------------------------------------------------------------
// Base track — covers `set`, `setVec`, and `spin` leaves.
// ---------------------------------------------------------------------------

/**
 * BaseSegment — one `[startSec, endSec)` window on a channel's base layer.
 *
 * Two sub-kinds are distinguished by the `segKind` discriminant:
 *
 *   - `'tween'` (from `set` / `setVec`): move the channel TO `to` over the
 *     window. `from` is optional here; the evaluator fills it from the prior
 *     segment's final value or the clip's `start` pose at scrub time.
 *     `to` is `number` for scalar channels, `Vec3` for `'target'`.
 *
 *   - `'spin'` (from `spin`): rotate the channel BY `to` (the `by` delta from
 *     the action) over the window. The `to` field stores the delta, NOT an
 *     absolute bearing — the evaluator adds it to the running pose rather than
 *     interpolating toward it. `from` is not needed for `spin` (the additive
 *     base is always the current channel value), but is kept optional for
 *     structural symmetry.
 *
 * `space` comes directly from the `set`/`spin` action (defaulting to
 * `CHANNEL_SPACE[ch]`). `ease` is also carried from the action.
 *
 * Segments in `baseTracks[channel]` are ordered by `startSec` ascending and
 * non-overlapping (guaranteed by `validateSingleWriter`, Task 5).
 */
export type BaseSegment = {
  readonly segKind: 'tween' | 'spin';
  readonly channel: Channel;
  readonly startSec: number;
  readonly endSec: number;
  readonly from?: number | Vec3;
  readonly to: number | Vec3;
  readonly ease: Ease;
  readonly space: Space;
};

// ---------------------------------------------------------------------------
// Velocity track — covers `rate` leaves.
// ---------------------------------------------------------------------------

/**
 * VelRamp — one velocity ramp window on a channel.
 *
 * A `rate` action ramps the channel's angular/linear velocity TO `to` over the
 * `[startSec, endSec)` window, then holds that velocity until the clip ends (or
 * another `VelRamp` on the same channel overrides it). The evaluator integrates
 * in closed form — no per-frame accumulator, so the result is frame-rate-
 * independent and scrubable.
 *
 * Multiple `VelRamp`s on the same channel are allowed (unlike `BaseSegment`
 * where overlaps are forbidden); a later ramp simply overrides the prior
 * velocity from its `startSec` onward.
 */
export type VelRamp = {
  readonly channel: Channel;
  readonly startSec: number;
  readonly endSec: number;
  readonly to: number;
  readonly ease: Ease;
};

// ---------------------------------------------------------------------------
// Oscillation track — covers `osc` leaves.
// ---------------------------------------------------------------------------

/**
 * OscTrack — a perpetual zero-mean sine oscillation on a channel.
 *
 * An `osc` action has no window (`startSec`/`endSec`): it runs for the entire
 * clip (or for the duration of the forked scope that contains it — the
 * evaluator is responsible for cancelling it at clip end). `amp` is the peak
 * deviation from the base+vel value; `period` is the full cycle length in
 * seconds.
 *
 * Multiple `OscTrack`s on the same channel are summed (each bob is independent),
 * consistent with the additive layer model.
 */
export type OscTrack = {
  readonly channel: Channel;
  readonly amp: number;
  readonly period: number;
};

// ---------------------------------------------------------------------------
// Scene cue list — covers SceneEffect leaves.
// ---------------------------------------------------------------------------

/**
 * SceneCue — a scene effect fired once when the playback clock crosses `atSec`.
 *
 * Cues in `CompiledClip.cues` are ordered by `atSec` ascending so the cue-firer
 * can advance a cursor linearly as the clock progresses, without scanning the
 * full list each frame.
 */
export type SceneCue = {
  readonly atSec: number;
  readonly effect: SceneEffect;
};

// ---------------------------------------------------------------------------
// CompiledClip — the top-level output of compileClip.
// ---------------------------------------------------------------------------

/**
 * CompiledClip — the fully flattened, evaluator-ready form of a `ClipData`.
 *
 * Produced by `compileClip` (Task 4) from a `ClipData`. Consumed by the
 * evaluator (Task 6) each frame and the cue-firer (Task 7) on each clock tick.
 *
 * All times are in seconds relative to the clip's start (after preroll is
 * applied — `baseTracks`, `velTracks`, `oscTracks`, and `cues` all use
 * post-preroll absolute times).
 */
export type CompiledClip = {
  /** The concrete starting camera pose. `'live'` is resolved upstream before
   *  compileClip is called; if `start` was absent or `'live'`, a zero pose
   *  (target [0,0,0], yaw 0, pitch 0, distance 0) is used as a placeholder
   *  until the live-resolution task (Task N) is wired in. */
  readonly start: CameraPose;

  /** Total duration of the AWAITED (non-fork) effect tree, including preroll.
   *  Fork children do not contribute to this value. */
  readonly durationSec: number;

  /** Per-channel base segments, one entry per Channel (possibly empty array).
   *  Within each channel, segments are ordered by startSec ascending and
   *  non-overlapping. */
  readonly baseTracks: Record<Channel, BaseSegment[]>;

  /** Velocity ramps from `rate` actions, across all channels, in emission
   *  order. The evaluator filters by channel as needed. */
  readonly velTracks: VelRamp[];

  /** Oscillation tracks from `osc` actions, across all channels. The evaluator
   *  sums contributions per channel each frame. */
  readonly oscTracks: OscTrack[];

  /** Time-ordered (ascending `atSec`) list of scene cues to fire. */
  readonly cues: SceneCue[];
};
