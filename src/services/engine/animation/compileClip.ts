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
 *   - `show` / `hide` / `scene` / `frameTo` → `SceneStep`, `focus` → `FocusStep`,
 *     `fade` → per-address `FactorSegment`s: together `CompiledClip.scene`.
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
import type { EffectPath } from '../../../@types/animation/EffectPath';
import type { EffectSpan } from '../../../@types/animation/EffectSpan';
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
import { ClipCompileError } from './ClipCompileError';
import { CompileFault } from './CompileFault';
import type { ClipCompileReason } from '../../../@types/animation/ClipCompileReason';
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
import type { SceneStep } from '../../../@types/animation/compiledClip/SceneStep';
import type { FocusStep } from '../../../@types/animation/compiledClip/FocusStep';
import type { FactorSegment } from '../../../@types/animation/compiledClip/FactorSegment';
import type { SceneTracks } from '../../../@types/animation/compiledClip/SceneTracks';
import type { SceneEffect } from '../../../@types/animation/SceneEffect';
import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import { clipFactorAt } from './clipFactorAt';

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
  // Every scene effect as a fire-once cue: the clip player's input until it evaluates `scene`.
  readonly cues: SceneCue[];
  // `steps`, `focus` and `fades` are in push (tree) order; `compileClip` time-sorts them.
  readonly steps: SceneStep[];
  readonly focus: FocusStep[];
  readonly fades: { readonly atSec: number; readonly effect: SceneEffect & { kind: 'fade' } }[];
  readonly compositeTracks: CompositeTrack[];
  readonly seqs: SeqSteps[];
  readonly spans: EffectSpan[];
  // Which effect emitted each base segment, composite track and cue, so a
  // validator's `CompileFault` (it names those objects) reports effect paths.
  readonly origin: Map<object, EffectPath>;
  // The resolved clip start pose — the seed of every channel's running value, so
  // a composite leaf can start from where the camera is (`startPoseAt`).
  readonly start: CameraPose;
  // The STEADY orientation-frame basis this clip compiles under; a `flyPath`
  // encodes its world tangents to (yaw, pitch) through it (see `buildPathTrack`).
  // Absent ⇒ identity (world-frame aim), so every non-frame caller is unchanged.
  readonly frameBasis?: Mat3;
};

function emitted<T extends object>(acc: Accum, path: EffectPath, item: T): T {
  acc.origin.set(item, path);
  return item;
}

// A mid-walk refusal, wrapped once at the node being walked: it alone knows the path.
function refusedAt<T>(reason: ClipCompileReason, path: EffectPath, acc: Accum, run: () => T): T {
  try {
    return run();
  } catch (e) {
    throw new ClipCompileError((e as Error).message, reason, [path], acc.spans, e);
  }
}

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
  path: EffectPath,
  atSec: number,
  acc: Accum,
): number {
  const joins = Math.max(children.filter(hasDuration).length - 1, 0);
  // Rule 1 needs only the join count (infinite steps make rule 2 vacuous); rule 2
  // needs the real durations, so it runs again after the walk.
  const per = refusedAt('seqOverlap', path, acc, () =>
    validateSeqOverlap(atSec, overlap, Array(joins + 1).fill(Infinity)),
  );
  const lens = () => [acc.baseSegs.length, acc.compositeTracks.length, acc.steps.length] as const;
  const span = (a: readonly number[], b: readonly number[]): StepSpan => ({
    segs: [a[0]!, b[0]!],
    composites: [a[1]!, b[1]!],
    steps: [a[2]!, b[2]!],
  });
  const steps: StepSpan[] = [];
  const durs: number[] = [];
  let pendingFrom = lens();
  let pending: number[] = [];
  let endSec = atSec;
  const flush = (startSec: number) => {
    for (const i of pending) walk(children[i]!, [...path, i], startSec, acc);
    pending = [];
  };
  for (const [i, child] of children.entries()) {
    if (!hasDuration(child)) {
      pending.push(i);
      continue;
    }
    const startSec = durs.length === 0 ? atSec : endSec - per[durs.length - 1]!;
    flush(startSec);
    const dur = walk(child, [...path, i], startSec, acc);
    if (dur <= 0) {
      const message = `seq at ${atSec}s: a step with a duration compiled to ${dur}s`;
      throw new ClipCompileError(message, 'seqOverlap', [path], acc.spans);
    }
    durs.push(dur);
    endSec = startSec + dur;
    const after = lens();
    steps.push(span(pendingFrom, after));
    pendingFrom = after;
  }
  flush(endSec);
  steps.push(span(pendingFrom, lens()));
  acc.seqs.push({ startSec: atSec, steps });
  refusedAt('seqOverlap', path, acc, () => validateSeqOverlap(atSec, overlap, durs));
  return endSec - atSec;
}

// Records the node's span once its children are walked, spliced in front of
// theirs so `spans` is pre-order. Walk order is tree order (an overlapped seq
// flushes its zero-length children before the step they precede).
function walk(effect: Effect, path: EffectPath, atSec: number, acc: Accum): number {
  const slot = acc.spans.length;
  const dur = walkNode(effect, path, atSec, acc);
  const endSec = atSec + dur;
  // A flyPath's track is the last composite it pushed; its last knot is pinned to
  // the cursor's `atSec + dur`, which can sit an ulp off the track's own endSec.
  const knots = effect.kind === 'flyPath' ? acc.compositeTracks.at(-1)!.knotSecs : undefined;
  acc.spans.splice(slot, 0, {
    path,
    startSec: atSec,
    endSec,
    ...(knots !== undefined ? { knotSecs: [...knots.slice(0, -1), endSec] } : {}),
  });
  return dur;
}

// ---------------------------------------------------------------------------
// Core recursive walk.
//
// Returns the AWAITED duration of the subtree rooted at `effect` when the
// subtree starts at `atSec`. Fork children always return 0 — a fork never
// keeps the enclosing scope alive.
// ---------------------------------------------------------------------------

function walkNode(effect: Effect, path: EffectPath, atSec: number, acc: Accum): number {
  switch (effect.kind) {
    // --- Structural: sequential composition ---
    case 'seq': {
      if (effect.overlap !== undefined) {
        return walkOverlappedSeq(effect.children, effect.overlap, path, atSec, acc);
      }
      let cursor = atSec;
      for (const [i, child] of effect.children.entries()) {
        cursor += walk(child, [...path, i], cursor, acc);
      }
      return cursor - atSec;
    }

    // --- Structural: concurrent composition; awaited on the LONGEST child ---
    case 'all': {
      let maxDur = 0;
      for (const [i, child] of effect.children.entries()) {
        const dur = walk(child, [...path, i], atSec, acc);
        if (dur > maxDur) maxDur = dur;
      }
      return maxDur;
    }

    // --- Structural: forked (fire and forget) — duration is 0 ---
    case 'fork': {
      walk(effect.child, [...path, 0], atSec, acc);
      return 0;
    }

    // --- Gap nodes: advance the clock but emit nothing ---
    case 'hold':
    case 'wait':
      return effect.sec;

    // --- Camera leaves: scalar tween (set) ---
    case 'set': {
      acc.baseSegs.push(
        emitted(acc, path, {
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
        }),
      );
      return effect.over;
    }

    // --- Camera leaves: Vec3 tween (setVec) ---
    case 'setVec': {
      acc.baseSegs.push(
        emitted(acc, path, {
          segKind: 'tween',
          channel: effect.ch,
          startSec: atSec,
          endSec: atSec + effect.over,
          to: effect.to,
          curve: { kind: 'ease', ease: effect.ease },
          space: 'lin',
          ...(effect.frame !== undefined ? { frame: effect.frame } : {}),
        }),
      );
      return effect.over;
    }

    // --- Camera leaves: additive spin (delta, not destination) ---
    case 'spin': {
      // `to` stores the `by` delta — the evaluator adds it to the running
      // channel value rather than interpolating toward an absolute bearing.
      // `space` falls back to CHANNEL_SPACE[ch] since spin has no `space`
      // field in CameraAction.
      acc.baseSegs.push(
        emitted(acc, path, {
          segKind: 'spin',
          channel: effect.ch,
          startSec: atSec,
          endSec: atSec + effect.over,
          to: effect.by,
          curve: { kind: 'ease', ease: effect.ease },
          space: CHANNEL_SPACE[effect.ch],
          ...(effect.loop !== undefined ? { loop: effect.loop } : {}),
        }),
      );
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
      const track = refusedAt('flyPath', path, acc, () =>
        buildPathTrack({
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
        }),
      );
      acc.compositeTracks.push(emitted(acc, path, track));
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
      acc.compositeTracks.push(emitted(acc, path, track));
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

    // --- Scene effects: point-in-time at atSec, awaiting zero time ---
    // A `frameTo`'s roll runs under the timeline, like a forked animation; an
    // author dwelling through it sequences a `wait`.
    case 'show':
    case 'hide':
    case 'fade':
    case 'scene':
    case 'focus':
    case 'frameTo': {
      acc.cues.push(emitted(acc, path, { atSec, effect }));
      if (effect.kind === 'focus') acc.focus.push(emitted(acc, path, { atSec, ref: effect.ref }));
      else if (effect.kind === 'fade') acc.fades.push(emitted(acc, path, { atSec, effect }));
      else acc.steps.push(emitted(acc, path, { atSec, effect }));
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

// Fades in time order, per address. `from` is the factor the earlier segments reached at the
// fade's start, and a fade to the target already held adds nothing (the `FadeController.fadeTo`
// no-op), so the factor matches what fire-once fades on a controller would have drawn.
function factorsOf(fades: Accum['fades']): SceneTracks['factors'] {
  const out: Partial<Record<VisibilityAddress, FactorSegment[]>> = {};
  for (const { atSec, effect } of [...fades].sort((a, b) => a.atSec - b.atSec)) {
    for (const address of effect.args) {
      const segs = out[address] ?? [];
      if (effect.to === (segs.at(-1)?.to ?? 1)) continue;
      const from = clipFactorAt(segs, atSec);
      segs.push({ startSec: atSec, endSec: atSec + effect.over, from, to: effect.to });
      out[address] = segs;
    }
  }
  return out;
}

// Post-walk validators name compiled objects; report them by the effects that emitted them.
function reportedByPath<T>(acc: Accum, run: () => T): T {
  try {
    return run();
  } catch (e) {
    if (!(e instanceof CompileFault)) throw e;
    const paths = e.culprits.map((c) => acc.origin.get(c)!);
    throw new ClipCompileError(e.message, e.reason, paths, acc.spans, e);
  }
}

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
 * @throws      `ClipCompileError` naming the effects at fault when the clip
 *              breaks a rule (writer clash, seq overlap, cue order, flyPath
 *              timing); a plain `Error` for an unresolved focus effect.
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
    steps: [],
    focus: [],
    fades: [],
    compositeTracks: [],
    seqs: [],
    spans: [],
    origin: new Map(),
    start,
    frameBasis,
  };

  // Walk the timeline, accumulating the cursor across top-level entries. A
  // leading `wait` simply advances the cursor before the rest, which is the
  // whole of the lead-in mechanism.
  let awaitedDur = 0;
  for (const [i, effect] of data.timeline.entries()) {
    awaitedDur += walk(effect, [i], awaitedDur, acc);
  }

  const sortedCues: SceneCue[] = [...acc.cues].sort((a, b) => a.atSec - b.atSec);

  const baseTracks = reportedByPath(acc, () => {
    validateSeqCueOrder(acc.seqs, acc.steps);
    // Both passes keep array positions, so a rewritten segment inherits its
    // original's path by index.
    const inherit = (segs: readonly BaseSegment[]) =>
      segs.forEach((seg, i) => acc.origin.set(seg, acc.origin.get(acc.baseSegs[i]!)!));
    // After the walk, so a segment walked before the composite it follows (an
    // earlier `all` sibling) still picks it up.
    const continued = acc.baseSegs.map((seg) => continuedFromComposite(seg, acc));
    inherit(continued);
    const resolved = resolveSeqJoins(continued, acc.compositeTracks, acc.seqs, start);
    inherit(resolved);
    const tracks = baseTracksOf(resolved);
    validateSingleWriter(tracks);
    validateCompositeExclusivity(tracks, acc.compositeTracks);
    return tracks;
  });

  return {
    start,
    durationSec: awaitedDur,
    baseTracks,
    velTracks: acc.velRamps,
    oscTracks: acc.oscTracks,
    cues: sortedCues,
    scene: {
      steps: [...acc.steps].sort((a, b) => a.atSec - b.atSec),
      focus: [...acc.focus].sort((a, b) => a.atSec - b.atSec),
      factors: factorsOf(acc.fades),
    },
    compositeTracks: acc.compositeTracks,
    spans: acc.spans,
  };
}
