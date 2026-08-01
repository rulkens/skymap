/**
 * compileClip — flatten a `ClipData` effect tree into the per-channel tracks
 * and cue list that the evaluator (Task 6) and cue-firer (Task 7) consume.
 *
 * ### Why compile, not interpret?
 *
 * Walking the recursive `Effect` tree each frame (or each scrub) is redundant
 * work: the tree is authored once and never changes during playback. Compiling
 * it once at registration time:
 *
 *   1. Makes the evaluator's hot path branch-free (sorted flat arrays instead of
 *      recursive dispatch).
 *   2. Lets the single-writer validator (Task 5) run once over the compiled
 *      tracks rather than re-checking the tree on every scrub.
 *   3. Enables memoisation of the compiled form keyed on the clip's identity
 *      (referential equality of `ClipData`).
 *
 * ### The walk algorithm
 *
 * `compileClip` drives a single recursive `walk` helper that carries an
 * "absolute start time" (the cursor position in the overall timeline) and
 * accumulates into four mutable arrays (`baseSegs`, `velRamps`, `oscTracks`,
 * `cues`). The walk returns the AWAITED duration of the subtree it processed
 * (fork children return 0 because a fork never keeps a scope alive).
 *
 * Structural nodes dispatch to:
 *   - `seq`: accumulate cursor sequentially across children.
 *   - `all`: share cursor across children; take the MAX child duration.
 *   - `fork`: walk the child but treat its returned duration as 0.
 *   - `hold` / `wait`: advance cursor by `sec`; emit nothing.
 *
 * Leaf nodes route by `kind`:
 *   - `set` / `setVec` → `BaseSegment` with `segKind:'tween'`.
 *   - `spin`           → `BaseSegment` with `segKind:'spin'`.
 *   - `rate`           → `VelRamp`.
 *   - `osc`            → `OscTrack`.
 *   - `show` / `hide` / `fade` / `scene` / `focus` / `frameTo` → `SceneCue`.
 *
 * ### Lead-in
 *
 * A clip that wants to open on its start pose before anything happens places a
 * `wait(sec)` first in its timeline — the cursor advances by `sec` and every
 * following window/cue lands later by exactly that much. There is no separate
 * clip-level `preroll` field: a leading `wait` already IS the lead-in, so the
 * data model keeps one way to express it rather than two.
 *
 * ### `start`
 *
 * If `data.start` is a concrete `CameraPose`, it becomes `CompiledClip.start`.
 * If `'live'` or absent, a zero pose is used as a placeholder — resolution of
 * `'live'` happens in the clip-player task (Task N); `compileClip` must not
 * crash on unresolved starts.
 *
 * ### Single-writer check
 *
 * After building `baseTracks`, `compileClip` calls `validateSingleWriter` to
 * assert that no two base writers overlap on any channel. Any clash throws
 * immediately at registration time, before the `CompiledClip` is returned.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type {
  CompiledClip,
  BaseSegment,
  VelRamp,
  OscTrack,
  SceneCue,
  PathTrack,
} from '../../../@types/animation/CompiledClip';
import type { Effect } from '../../../@types/animation/Effect';
import type { Channel } from '../../../@types/animation/Channel';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import { CHANNEL_SPACE } from './channelSpace';
import { validateSingleWriter } from './validateSingleWriter';
import { buildPathTrack } from './buildPathTrack';

// ---------------------------------------------------------------------------
// Zero pose — used when start is 'live' or absent (placeholder; resolved by
// the clip-player task before the clip actually runs).
// ---------------------------------------------------------------------------

const ZERO_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0 };

// All four channels, used to build the initial baseTracks record.
const ALL_CHANNELS: Channel[] = ['distance', 'yaw', 'pitch', 'target'];

// ---------------------------------------------------------------------------
// Mutable accumulator — threaded through the recursive walk.
// ---------------------------------------------------------------------------

type Accum = {
  readonly baseSegs: BaseSegment[];
  readonly velRamps: VelRamp[];
  readonly oscTracks: OscTrack[];
  readonly cues: SceneCue[];
  readonly pathTracks: PathTrack[];
  // The resolved clip start pose — a `flyPath` flies out of it (it is the first
  // spline knot), so the walk needs it when it reaches a `flyPath` leaf.
  readonly start: CameraPose;
  // The STEADY orientation-frame basis this clip compiles under; a `flyPath`
  // encodes its world tangents to (yaw, pitch) through it (see `buildPathTrack`).
  // Absent ⇒ identity (world-frame aim), so every non-frame caller is unchanged.
  readonly frameBasis?: Mat3;
};

// ---------------------------------------------------------------------------
// Core recursive walk.
//
// Returns the AWAITED duration of the subtree rooted at `effect` when the
// subtree starts at `atSec`. Fork children always return 0 — a fork never
// keeps the enclosing scope alive.
// ---------------------------------------------------------------------------

function walk(effect: Effect, atSec: number, acc: Accum): number {
  switch (effect.kind) {
    // --- Structural: sequential composition ---
    case 'seq': {
      let cursor = atSec;
      for (const child of effect.children) {
        cursor += walk(child, cursor, acc);
      }
      return cursor - atSec;
    }

    // --- Structural: concurrent composition; awaited on the LONGEST child ---
    case 'all': {
      let maxDur = 0;
      for (const child of effect.children) {
        const dur = walk(child, atSec, acc);
        if (dur > maxDur) maxDur = dur;
      }
      return maxDur;
    }

    // --- Structural: forked (fire and forget) — duration is 0 ---
    case 'fork': {
      walk(effect.child, atSec, acc);
      return 0;
    }

    // --- Gap nodes: advance the clock but emit nothing ---
    case 'hold':
    case 'wait':
      return effect.sec;

    // --- Camera leaves: scalar tween (set) ---
    case 'set': {
      acc.baseSegs.push({
        segKind: 'tween',
        channel: effect.ch,
        startSec: atSec,
        endSec: atSec + effect.over,
        to: effect.to,
        ease: effect.ease,
        space: effect.space,
      });
      return effect.over;
    }

    // --- Camera leaves: Vec3 tween (setVec) ---
    case 'setVec': {
      acc.baseSegs.push({
        segKind: 'tween',
        channel: effect.ch,
        startSec: atSec,
        endSec: atSec + effect.over,
        to: effect.to,
        ease: effect.ease,
        space: 'lin',
      });
      return effect.over;
    }

    // --- Camera leaves: additive spin (delta, not destination) ---
    case 'spin': {
      // `to` stores the `by` delta — the evaluator adds it to the running
      // channel value rather than interpolating toward an absolute bearing.
      // `space` falls back to CHANNEL_SPACE[ch] since spin has no `space`
      // field in CameraAction.
      acc.baseSegs.push({
        segKind: 'spin',
        channel: effect.ch,
        startSec: atSec,
        endSec: atSec + effect.over,
        to: effect.by,
        ease: effect.ease,
        space: CHANNEL_SPACE[effect.ch],
        ...(effect.loop !== undefined ? { loop: effect.loop } : {}),
      });
      return effect.over;
    }

    // --- Camera leaves: multi-waypoint flythrough (composite writer) ---
    case 'flyPath': {
      const waypoints = effect.waypoints.map((w) => {
        if (!('at' in w)) {
          throw new Error(
            `resolveClipFoci must run before compileClip (unresolved flyPath waypoint with id '${w.id}')`,
          );
        }
        return w;
      });
      const track = buildPathTrack({
        start: acc.start,
        startSec: atSec,
        over: effect.over,
        ease: effect.ease,
        waypoints,
        align: effect.align,
        rampSec: effect.rampSec,
        linger: effect.linger,
        lingerSec: effect.lingerSec,
        spline: effect.spline,
        passBy: effect.passBy,
        frameBasis: acc.frameBasis,
      });
      acc.pathTracks.push(track);
      // A dwell (`linger` + `lingerSec`) ADDS time, so the real duration is the
      // track's — not the authored `over` (the cruise budget). Return it so the
      // cursor and the single-writer window land on the true end.
      return track.endSec - atSec;
    }

    // --- Camera leaves: velocity ramp ---
    case 'rate': {
      acc.velRamps.push({
        channel: effect.ch,
        startSec: atSec,
        endSec: atSec + effect.over,
        to: effect.to,
        ease: effect.ease,
      });
      return effect.over;
    }

    // --- Camera leaves: oscillation (windowed; perpetual = the [-∞, +∞) case) ---
    case 'osc': {
      // A bare bob (no `over`) is perpetual: the maximal window, never gated,
      // never faded — identical to the historical always-on sine. A windowed
      // bob plays over `[atSec, atSec + over)` and fades its amplitude at the
      // ends; its phase is window-local in the evaluator (sine starts at 0
      // where the window starts). Perpetual bobs read absolute time.
      const windowed = effect.over !== undefined;
      acc.oscTracks.push({
        channel: effect.ch,
        amp: effect.amp,
        period: effect.period,
        startSec: windowed ? atSec : -Infinity,
        endSec: windowed ? atSec + effect.over! : Infinity,
        fade: effect.fade ?? 0,
        ease: effect.ease,
      });
      // `osc` contributes no awaited duration — it runs under its scope as a
      // background layer; a windowed bob self-terminates via its window, never
      // gating the timeline.
      return 0;
    }

    // --- Scene effects: all fire as point-in-time cues at atSec ---
    // `frameTo` joins them: it fires its `setOrientation` + `startFrameTween`
    // at the beat and awaits zero time (the roll runs under the timeline, like
    // a forked animation). An author dwelling through it sequences a `wait`.
    case 'show':
    case 'hide':
    case 'fade':
    case 'scene':
    case 'focus':
    case 'frameTo': {
      acc.cues.push({ atSec, effect });
      return 0;
    }

    // --- Unresolved focus-bound effects: must be rewritten by resolveClipFoci
    // before compileClip is called. Reaching any of these cases is a
    // programming error — the clip was passed to compileClip with unresolved IDs.
    case 'moveTargetId':
    case 'dollyToId':
    case 'lookAtId':
    case 'strafeId':
    case 'spinToId':
    case 'aimAlong':
    case 'focusId': {
      throw new Error(`resolveClipFoci must run before compileClip (unresolved ${effect.kind})`);
    }

    // TypeScript exhaustiveness guard — the union is closed.
    default: {
      const _exhaustive: never = effect;
      throw new Error(`unhandled effect kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// compileClip — public entry point.
// ---------------------------------------------------------------------------

/**
 * compileClip — pure function; walks `data.timeline` once and produces the
 * flat `CompiledClip` the evaluator and cue-firer consume.
 *
 * The only side effects are the allocations needed to build the output arrays
 * and the `Record<Channel, BaseSegment[]>` map — no engine state is read or
 * written.
 *
 * @param data        The authored clip description.
 * @param frameBasis  The STEADY orientation-frame basis a `flyPath` encodes its
 *                    world tangents through (see `buildPathTrack`). Absent ⇒
 *                    identity (world-frame aim); a clip with no `flyPath` is
 *                    unaffected either way, so `durationSec`-only callers may
 *                    omit it.
 * @returns           A `CompiledClip` ready for the evaluator.
 *
 * @throws      Throws via `validateSingleWriter` when a base-layer write clash
 *              is detected on a channel (two overlapping `[start, end)` windows
 *              on the same channel's base track).
 */
export function compileClip(data: ClipData, frameBasis?: Mat3): CompiledClip {
  // Resolve the starting pose — 'live' and absent both fall through to the
  // zero placeholder; a concrete CameraPose is used directly.
  const start: CameraPose =
    data.start !== undefined && data.start !== 'live' ? data.start : ZERO_POSE;

  // Mutable accumulators, allocated once per compile call.
  const acc: Accum = {
    baseSegs: [],
    velRamps: [],
    oscTracks: [],
    cues: [],
    pathTracks: [],
    start,
    frameBasis,
  };

  // Walk the timeline, accumulating the cursor across top-level entries. A
  // leading `wait` simply advances the cursor before the rest, which is the
  // whole of the lead-in mechanism.
  let awaitedDur = 0;
  for (const effect of data.timeline) {
    awaitedDur += walk(effect, awaitedDur, acc);
  }

  const sortedCues: SceneCue[] = [...acc.cues].sort((a, b) => a.atSec - b.atSec);

  // Build baseTracks as Record<Channel, BaseSegment[]> with an entry for
  // every channel (sorted ascending by startSec within each channel).
  const baseTracks = Object.fromEntries(
    ALL_CHANNELS.map((ch) => [
      ch,
      acc.baseSegs.filter((s) => s.channel === ch).sort((a, b) => a.startSec - b.startSec),
    ]),
  ) as Record<Channel, BaseSegment[]>;

  validateSingleWriter(baseTracks);
  validatePathExclusivity(baseTracks, acc.pathTracks);

  return {
    start,
    durationSec: awaitedDur,
    baseTracks,
    velTracks: acc.velRamps,
    oscTracks: acc.oscTracks,
    cues: sortedCues,
    pathTracks: acc.pathTracks,
  };
}

/**
 * validatePathExclusivity — a `flyPath` is a COMPOSITE base writer: it drives
 * all four camera channels over its window. So just like two `set`s on the same
 * channel clash, a base segment that overlaps a path window is a clash too — the
 * evaluator would let the path silently win, which is a footgun, not a feature.
 * Catch it at registration time with the same loud-throw discipline as
 * `validateSingleWriter`.
 */
function validatePathExclusivity(
  baseTracks: Record<Channel, BaseSegment[]>,
  pathTracks: PathTrack[],
): void {
  for (const path of pathTracks) {
    for (const ch of ALL_CHANNELS) {
      for (const seg of baseTracks[ch]) {
        const overlaps = seg.startSec < path.endSec && path.startSec < seg.endSec;
        if (overlaps) {
          throw new Error(
            `flyPath window [${path.startSec}, ${path.endSec}) overlaps a base '${ch}' writer ` +
              `[${seg.startSec}, ${seg.endSec}). A flyPath owns all camera channels for its window — ` +
              `move the conflicting camera action outside it.`,
          );
        }
      }
    }
  }
}
