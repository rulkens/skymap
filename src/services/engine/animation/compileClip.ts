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
 * assert that no two base writers overlap on any channel, except the crossfade
 * pairs `resolveSeqJoins` marked in an overlapping `seq`. Any clash throws
 * immediately at registration time, before the `CompiledClip` is returned.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { CompiledClip } from '../../../@types/animation/compiledClip/CompiledClip';
import type { Effect } from '../../../@types/animation/Effect';
import type { CameraPose } from '../../../@types/camera/pose/CameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import { CHANNEL_SPACE } from './channelSpace';
import { validateSingleWriter } from './validateSingleWriter';
import { validateCompositeExclusivity } from './validateCompositeExclusivity';
import { buildPathTrack } from './buildPathTrack';
import { buildGeodesicTrack } from './buildGeodesicTrack';
import { hasDuration } from './hasDuration';
import { validateSeqOverlap } from './validateSeqOverlap';
import { validateSeqCueOrder } from './validateSeqCueOrder';
import { resolveSeqJoins } from './resolveSeqJoins';
import { baseTracksOf } from './baseTracksOf';
import type { SeqOverlap } from '../../../@types/animation/SeqOverlap';
import type { SeqSteps } from '../../../@types/animation/SeqSteps';
import type { StepSpan } from '../../../@types/animation/StepSpan';
import { channelValueAt } from './channelValueAt';
import type { CompositeSample } from '../../../@types/animation/compiledClip/CompositeSample';
import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { VelRamp } from '../../../@types/animation/compiledClip/VelRamp';
import type { OscTrack } from '../../../@types/animation/compiledClip/OscTrack';
import type { CompositeTrack } from '../../../@types/animation/compiledClip/CompositeTrack';
import type { SceneCue } from '../../../@types/animation/compiledClip/SceneCue';

// ---------------------------------------------------------------------------
// Zero pose — used when start is 'live' or absent (placeholder; resolved by
// the clip-player task before the clip actually runs).
// ---------------------------------------------------------------------------

const ZERO_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0 };

// ---------------------------------------------------------------------------
// Mutable accumulator — threaded through the recursive walk.
// ---------------------------------------------------------------------------

type Accum = {
  readonly baseSegs: BaseSegment[];
  readonly velRamps: VelRamp[];
  readonly oscTracks: OscTrack[];
  readonly cues: SceneCue[];
  readonly compositeTracks: CompositeTrack[];
  readonly seqs: SeqSteps[];
  // The resolved clip start pose — the seed of every channel's running value, so
  // a composite leaf can start from where the camera is (`startPoseAt`).
  readonly start: CameraPose;
  // The STEADY orientation-frame basis this clip compiles under; a `flyPath`
  // encodes its world tangents to (yaw, pitch) through it (see `buildPathTrack`).
  // Absent ⇒ identity (world-frame aim), so every non-frame caller is unchanged.
  readonly frameBasis?: Mat3;
};

// A composite leaf starts from the running value of each channel at `atSec`,
// so it continues the previous move rather than snapping to the clip start.
// Known limit: read in walk order (the track's duration needs it), so a base
// segment in a LATER `all` sibling is not yet accumulated.
function startPoseAt(atSec: number, acc: Accum): CameraPose {
  const { start } = acc;
  const at = <C extends keyof CompositeSample>(ch: C, seed: NonNullable<CompositeSample[C]>) =>
    channelValueAt(ch, atSec, acc.baseSegs, acc.compositeTracks, seed).value;
  return {
    ...start,
    target: at('target', start.target),
    distance: at('distance', start.distance),
    yaw: at('yaw', start.yaw),
    pitch: at('pitch', start.pitch),
  };
}

// The first base segment after a composite continues from its final sample;
// `from` stays absent otherwise, so a clip without composites compiles as before.
// No composite writes `roll` or `fov` (`CompositeSample`), so neither continues one.
function continuedFromComposite(seg: BaseSegment, acc: Accum): BaseSegment {
  if (seg.from !== undefined || seg.channel === 'roll' || seg.channel === 'fov') return seg;
  const ch = seg.channel;
  const { value, byComposite } = channelValueAt(
    ch,
    seg.startSec,
    acc.baseSegs,
    acc.compositeTracks,
    acc.start[ch],
  );
  return byComposite ? { ...seg, from: value } : seg;
}

// A seq with `overlap`: step k+1 (with a duration) starts `overlap[k]` before
// step k ends. Zero-length children wait for the next step with a duration and
// fire at its start (at the seq end when none follows), so they never count as joins.
function walkOverlappedSeq(
  children: readonly Effect[],
  overlap: SeqOverlap,
  atSec: number,
  acc: Accum,
): number {
  const joins = Math.max(children.filter(hasDuration).length - 1, 0);
  // Rule 1 needs only the join count (infinite steps make rule 2 vacuous); rule 2
  // needs the real durations, so it runs again after the walk.
  const per = validateSeqOverlap(atSec, overlap, Array(joins + 1).fill(Infinity));
  const lens = () => [acc.baseSegs.length, acc.compositeTracks.length, acc.cues.length] as const;
  const span = (a: readonly number[], b: readonly number[]): StepSpan => ({
    segs: [a[0]!, b[0]!],
    composites: [a[1]!, b[1]!],
    cues: [a[2]!, b[2]!],
  });
  const steps: StepSpan[] = [];
  const durs: number[] = [];
  let pendingFrom = lens();
  let pending: Effect[] = [];
  let endSec = atSec;
  let first = true;
  const flush = (startSec: number) => {
    for (const child of pending) walk(child, startSec, acc);
    pending = [];
  };
  for (const child of children) {
    if (!hasDuration(child)) {
      pending.push(child);
      continue;
    }
    const j = durs.length - 1;
    const startSec = first ? atSec : endSec - per[j]!;
    first = false;
    flush(startSec);
    const dur = walk(child, startSec, acc);
    if (dur <= 0) throw new Error(`seq at ${atSec}s: a step with a duration compiled to ${dur}s`);
    durs.push(dur);
    endSec = startSec + dur;
    const after = lens();
    steps.push(span(pendingFrom, after));
    pendingFrom = after;
  }
  flush(endSec);
  const end = lens();
  if (end[0] !== pendingFrom[0] || end[1] !== pendingFrom[1] || end[2] !== pendingFrom[2]) {
    steps.push(span(pendingFrom, end));
  }
  acc.seqs.push({ startSec: atSec, steps });
  validateSeqOverlap(atSec, overlap, durs);
  return endSec - atSec;
}

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
      if (effect.overlap !== undefined) {
        return walkOverlappedSeq(effect.children, effect.overlap, atSec, acc);
      }
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
        curve: { kind: 'ease', ease: effect.ease },
        space: effect.space,
        // Conditional so an untagged endpoint compiles to the byte-identical
        // segment it always did — `frame` absent, not `frame: undefined`.
        ...(effect.frame !== undefined ? { frame: effect.frame } : {}),
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
        curve: { kind: 'ease', ease: effect.ease },
        space: 'lin',
        ...(effect.frame !== undefined ? { frame: effect.frame } : {}),
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
        curve: { kind: 'ease', ease: effect.ease },
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
        start: startPoseAt(atSec, acc),
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
      acc.compositeTracks.push(track);
      // A dwell (`linger` + `lingerSec`) ADDS time, so the real duration is the
      // track's — not the authored `over` (the cruise budget). Return it so the
      // cursor and the single-writer window land on the true end.
      return track.endSec - atSec;
    }

    // --- Camera leaves: zoom/pan geodesic (composite writer over target + distance) ---
    case 'geodesic': {
      const track = buildGeodesicTrack({
        start: startPoseAt(atSec, acc),
        startSec: atSec,
        to: effect.to,
        tuning: effect.tuning,
        fovYRad: effect.fovYRad,
        over: effect.over,
      });
      acc.compositeTracks.push(track);
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
    compositeTracks: [],
    seqs: [],
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

  validateSeqCueOrder(acc.seqs, acc.cues);

  const sortedCues: SceneCue[] = [...acc.cues].sort((a, b) => a.atSec - b.atSec);

  // After the walk, so a segment walked before the composite it follows (an
  // earlier `all` sibling) still picks it up.
  const baseSegs = resolveSeqJoins(
    acc.baseSegs.map((seg) => continuedFromComposite(seg, acc)),
    acc.compositeTracks,
    acc.seqs,
  );
  const baseTracks = baseTracksOf(baseSegs);

  validateSingleWriter(baseTracks);
  validateCompositeExclusivity(baseTracks, acc.compositeTracks);

  return {
    start,
    durationSec: awaitedDur,
    baseTracks,
    velTracks: acc.velRamps,
    oscTracks: acc.oscTracks,
    cues: sortedCues,
    compositeTracks: acc.compositeTracks,
  };
}
