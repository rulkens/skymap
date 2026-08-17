/**
 * evaluateClip — pure per-clip camera evaluator: given a `ClipData` and an
 * elapsed time in seconds, returns the camera pose at that instant.
 *
 * ### The three-layer composition model
 *
 * Camera motion is modelled as three additive layers per channel:
 *
 *   final[ch](t) = base[ch](t)  +  ∫₀ᵗ vel[ch]  +  osc[ch](t)
 *
 * **Base layer** (`baseTracks`): absolute tweens and delta spins. Only one
 * writer per channel per window (enforced at compile time). Between segments
 * the channel holds its most recent value.
 *
 * **Velocity layer** (`velTracks`): closed-form integral of `rate` ramps. A
 * ramp accelerates a channel's velocity FROM the velocity carried out of the
 * previous ramp TO its own `to` over its window `[s, e)`, then HOLDS `to`
 * until the next ramp starts (or forever, if it is the last). Multiple ramps
 * on the same channel form an OVERRIDE chain: a later ramp takes over from
 * the prior ramp's carried velocity at its own `startSec`. Each ramp is only
 * active over its own interval — it does not keep accumulating after the next
 * ramp starts. The total displacement is a pure function of `t` — NO
 * per-frame accumulator.
 *
 * **Oscillation layer** (`oscTracks`): zero-mean sine bob,
 * `amp · env(t) · sin(2π t / period)`. Additive with both base and velocity.
 * A bob is active over `[startSec, endSec)` (a perpetual bob is the limiting
 * `[-∞, +∞)` case, where `env ≡ 1` and it reduces to `amp · sin(2π t / period)`);
 * `env` ramps the amplitude in/out over the window's `fade` seconds. Multiple
 * tracks on the same channel are summed independently.
 *
 * ### Velocity-integral method
 *
 * For a channel's VelRamps r_0..r_{k-1} sorted ascending by startSec,
 * let b_i = r_{i+1}.startSec (the "boundary" where the next ramp takes over),
 * and b_{last} = +Infinity. Ramp i is active over [s_i, b_i).
 *
 * Carried velocity into r_0 is 0; into r_{i+1} is the velocity of r_i
 * evaluated at b_i (= to_i if b_i ≥ e_i, otherwise the mid-ramp value).
 *
 * Velocity inside ramp i at u ∈ [s_i, e_i):
 *   v(u) = carriedV_i + (to_i − carriedV_i) · EASE((u − s_i) / (e_i − s_i))
 * For u ≥ e_i (held): v(u) = to_i.
 *
 * Displacement contributed by ramp i over [s_i, min(t, b_i)]:
 *   ramp portion: carriedV_i·Δ + (to_i − carriedV_i)·dur_i·∫₀^q EASE(p) dp
 *     where Δ = min(min(t,b_i), e_i) − s_i, q = Δ / dur_i
 *   held portion: to_i · (min(t, b_i) − e_i)  if min(t, b_i) > e_i
 *
 * For `ease:'linear'`, ∫₀^q p dp = q²/2 (analytic). Non-linear eases use
 * a 64-step Simpson quadrature over [0, q]. The quadrature is deterministic
 * and frame-rate-independent — the same (ramp, t) pair always produces the
 * same displacement.
 *
 * With a single ramp, carriedV=0 and b_0=∞, so the formula reduces exactly
 * to the prior single-ramp behavior.
 *
 * ### Spin-loop continuation choice
 *
 * For a `spin` segment with `loop: true`, the spin delta continues beyond
 * `endSec` as a LINEAR extrapolation of the final rate: for t ≥ startSec,
 * the total delta is `by · (t − startSec) / (endSec − startSec)`.
 * The tested clips do not exercise `loop`, but flyout/dwellDrift authors can
 * rely on linear continuation.
 *
 * ### Memoised compile cache
 *
 * `evaluateClip` compiles `ClipData` to a `CompiledClip` on first call and
 * caches the result on `data` reference identity via a module-level `WeakMap`.
 * The cache also remembers the orientation `frameBasis` the clip was compiled
 * under: a `flyPath`'s aim is encoded through the steady basis, so the same
 * `ClipData` under a different frame recompiles (a reference compare against the
 * stable `ORIENTATION_FRAMES[frame]` object). Steady frames — the common case —
 * hit the cache and avoid re-flattening the effect tree every frame.
 *
 * ### Purity
 *
 * - `data` and the cached `CompiledClip` are never mutated.
 * - The returned `CameraPose` allocates a fresh `target` triple each call.
 * - Same `(data, elapsedSec, frameBasis)` triple ⇒ deep-equal output.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type {
  CompiledClip,
  BaseSegment,
  VelRamp,
  PathTrack,
} from '../../../@types/animation/CompiledClip';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Channel } from '../../../@types/animation/Channel';
import type { Ease } from '../../../@types/animation/Ease';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import { compileClip } from '../animation/compileClip';
import { lerpInSpace } from '../animation/channelSpace';
import { EASE } from '../animation/ease';
import { lerpAngleShortest } from '../../../utils/math/lerpAngleShortest';
import { lerp } from '../../../utils/math/lerp';

// ---------------------------------------------------------------------------
// Module-level compile cache — keyed on ClipData reference identity.
// Plan B's playClip will reuse this same WeakMap.
// ---------------------------------------------------------------------------

// The cache stores the basis a clip was last compiled under alongside its
// compiled form. A `flyPath`'s aim is encoded through the STEADY orientation
// basis (see `buildPathTrack`), so the same `ClipData` under a different frame
// must recompile. Registry basis objects (`ORIENTATION_FRAMES[frame]`) are
// stable per frame, so a reference compare is exact and cheap: steady frames
// hit the cache, an orientation switch (rare) recompiles once. A basis-free clip
// (no `flyPath`) recompiles to a byte-identical result, so this never affects a
// tween / static clip.
type Cached = { readonly frameBasis: Mat3 | undefined; readonly compiled: CompiledClip };
const compileCache = new WeakMap<ClipData, Cached>();

function getCompiled(data: ClipData, frameBasis: Mat3 | undefined): CompiledClip {
  const cached = compileCache.get(data);
  if (cached !== undefined && cached.frameBasis === frameBasis) return cached.compiled;
  const compiled = compileClip(data, frameBasis);
  compileCache.set(data, { frameBasis, compiled });
  return compiled;
}

// ---------------------------------------------------------------------------
// Velocity integral helpers
//
// The ramp integral ∫_0^{q} carriedV + (to − carriedV)·E(x) dx in closed form
// for linear ease, and 64-step Simpson quadrature for the other eases.
// ---------------------------------------------------------------------------

const SIMPSON_STEPS = 64; // must be even for Simpson's rule

/**
 * Integrate E(x) over [0, p] using 64-step Simpson's rule.
 * `p` is the normalised progress in [0, 1]. Returns the integral value.
 */
function integrateEase(easeName: Ease, p: number): number {
  if (p <= 0) return 0;
  const clampedP = Math.min(1, p);
  const easeFn = EASE[easeName];
  const n = SIMPSON_STEPS; // even number of steps
  const h = clampedP / n;
  // Simpson's rule: h/3 * (f(x0) + 4f(x1) + 2f(x2) + ... + 4f(xn-1) + f(xn))
  let sum = easeFn(0) + easeFn(clampedP);
  for (let i = 1; i < n; i++) {
    const x = i * h;
    sum += (i % 2 === 0 ? 2 : 4) * easeFn(x);
  }
  return (h / 3) * sum;
}

/**
 * rampVelocity — velocity produced by ONE VelRamp at time u, given its
 * carried-in velocity `carriedV`.
 *
 * v(u) = carriedV + (to − carriedV)·E((u − s) / (e − s))  for u ∈ [s, e)
 * v(u) = to                                                 for u ≥ e
 * v(u) = carriedV                                           for u < s
 */
function rampVelocity(ramp: VelRamp, carriedV: number, u: number): number {
  const { startSec: s, endSec: e, to, ease } = ramp;
  if (u < s) return carriedV;
  if (u >= e) return to;
  const dur = e - s;
  const progress = dur > 0 ? (u - s) / dur : 1;
  return carriedV + (to - carriedV) * EASE[ease](progress);
}

/**
 * rampContribution — displacement contributed by ONE VelRamp over its ACTIVE
 * interval [s_i, min(t, b_i)], given its carried-in velocity `carriedV`.
 *
 * `boundary` is b_i = next ramp's startSec (or +Infinity for the last ramp).
 * The ramp is only responsible for its own active interval — it does not keep
 * accumulating past `boundary` even though it might hold a non-zero velocity.
 *
 * Decomposed into:
 *   ramp portion: carriedV·Δ + (to − carriedV)·dur·∫_0^q E(x) dx
 *     where Δ = min(w, e) − s, q = Δ / dur, w = min(t, boundary)
 *   held portion: to · (w − e)  if w > e
 */
function rampContribution(ramp: VelRamp, carriedV: number, boundary: number, t: number): number {
  const { startSec: s, endSec: e, to, ease } = ramp;
  // The ramp is active over [s, boundary). Clamp our query window to that.
  const w = Math.min(t, boundary);
  if (w <= s) return 0;

  const dur = e - s;
  // The ramp portion: velocity linearly-or-eased from carriedV to to over [s, e).
  const rampEnd = Math.min(w, e);
  const delta = rampEnd - s; // time within the ramp portion being integrated
  const q = dur > 0 ? delta / dur : 1;

  let rampPart: number;
  if (ease === 'linear') {
    // Analytic closed form for linear ease (E(x) = x):
    //   ∫_0^q [carriedV + (to − carriedV)·x] dx
    //   = carriedV·q + (to − carriedV)·q²/2
    // Multiply by dur to convert back from normalised units to seconds.
    rampPart = dur * (carriedV * q + (to - carriedV) * (q * q) * 0.5);
  } else {
    // 64-step Simpson quadrature: ∫_0^q E(x) dx.
    //   Total: dur·[carriedV·q + (to − carriedV)·∫_0^q E(x) dx]
    rampPart = dur * (carriedV * q + (to - carriedV) * integrateEase(ease, q));
  }

  // The held portion: velocity is exactly `to` for all u ≥ e within [s, w].
  const holdPart = w > e ? to * (w - e) : 0;
  return rampPart + holdPart;
}

// ---------------------------------------------------------------------------
// Velocity layer — override chain across all ramps on a channel.
//
// Ramps are processed in ascending startSec order. Each ramp is active only
// over [s_i, b_i) where b_i = next ramp's startSec. Carried velocity passes
// forward: carriedV_{i+1} = velocity of ramp i at b_i.
//
// With a single ramp, carriedV=0 and boundary=+Infinity, which reduces
// exactly to the prior single-ramp behavior.
// ---------------------------------------------------------------------------

function velDisplacement(compiled: CompiledClip, ch: Channel, t: number): number {
  // Collect and sort this channel's ramps by startSec ascending.
  const ramps = compiled.velTracks.filter((r) => r.channel === ch);
  if (ramps.length === 0) return 0;
  ramps.sort((a, b) => a.startSec - b.startSec);

  let total = 0;
  let carriedV = 0;

  for (let i = 0; i < ramps.length; i++) {
    const ramp = ramps[i]!;
    const nextRamp = ramps[i + 1];
    const boundary = nextRamp !== undefined ? nextRamp.startSec : Infinity;

    // Accumulate this ramp's contribution over its own active interval.
    total += rampContribution(ramp, carriedV, boundary, t);

    // If t is still before this ramp's active interval ends, we're done.
    if (t < boundary) break;

    // Carry forward the velocity this ramp holds at the boundary.
    carriedV = rampVelocity(ramp, carriedV, boundary);
  }

  return total;
}

// ---------------------------------------------------------------------------
// Oscillation layer — sum of all osc tracks on a channel.
// ---------------------------------------------------------------------------

/**
 * oscEnvelope — the amplitude multiplier for a windowed bob at window-local time
 * `local` (= t − startSec) given window length `dur` and ramp `fade`.
 *
 * Trapezoid: amplitude rises over the first `fade` seconds, holds at 1, falls
 * over the last `fade` seconds. `Math.min(up, down)` is the linear trapezoid;
 * `EASE[ease]` shapes the shoulders (and clamps to [0, 1], so the held middle —
 * where both ratios exceed 1 — pins to 1). `fade <= 0` short-circuits to a flat
 * 1, which is also what keeps the perpetual case (`dur = Infinity`) off the
 * Infinity arithmetic.
 */
function oscEnvelope(local: number, dur: number, fade: number, ease: Ease): number {
  if (fade <= 0) return 1;
  const up = local / fade;
  const down = (dur - local) / fade;
  return EASE[ease](Math.min(up, down));
}

function oscOffset(compiled: CompiledClip, ch: Channel, t: number): number {
  let total = 0;
  for (const osc of compiled.oscTracks) {
    if (osc.channel !== ch) continue;
    if (t < osc.startSec || t >= osc.endSec) continue; // outside the window → silent
    const env = oscEnvelope(t - osc.startSec, osc.endSec - osc.startSec, osc.fade, osc.ease);
    // Windowed bobs read their phase WINDOW-LOCALLY, so the sine starts at 0
    // where the window starts and a period fitted to the window (dwellDrift's
    // integer-cycle fit) ends at 0 on the cut — the same dwell swings the same
    // way wherever it sits in the timeline. Absolute-time phase would make the
    // swing (and the fade's alignment against its zero crossings) depend on
    // the window's timeline position. Perpetual bobs (startSec = −∞) keep
    // absolute phase — window-local would be Infinity arithmetic, and with no
    // window there is nothing to align to anyway.
    const phaseT = osc.startSec === -Infinity ? t : t - osc.startSec;
    total += osc.amp * env * Math.sin((2 * Math.PI * phaseT) / osc.period);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Base layer — fold prior (ended) segments then apply the active/last one.
// ---------------------------------------------------------------------------

/**
 * evaluateBaseScalar — evaluate the base layer for a scalar channel at time t.
 *
 * Walks the channel's segments in order, accumulating the "running value" that
 * each completed segment leaves. Applies the active or last segment to t.
 *
 * For `yaw`, the interpolation uses `lerpAngleShortest` instead of
 * `lerpInSpace` to prevent multi-revolution artifacts when the user has
 * accumulated a large yaw from prior dragging.
 */
function evaluateBaseScalar(
  segments: BaseSegment[],
  startVal: number,
  channel: Channel,
  t: number,
): number {
  if (segments.length === 0) return startVal;

  let runningVal = startVal;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;

    if (t < seg.startSec) {
      // Before this segment starts — running value from prior segments is the result.
      return runningVal;
    }

    // The running value at the START of this segment is the value we've accumulated so far.
    const segStart = runningVal;

    if (seg.segKind === 'tween') {
      const from = seg.from !== undefined ? (seg.from as number) : segStart;
      const to = seg.to as number;

      if (t >= seg.endSec) {
        // Segment is complete — hold at `to`.
        runningVal = to;
      } else {
        // Active segment — apply eased interpolation.
        const dur = seg.endSec - seg.startSec;
        const localT = dur > 0 ? (t - seg.startSec) / dur : 1;
        const e = EASE[seg.ease](localT);

        if (channel === 'yaw') {
          return lerpAngleShortest(from, to, e);
        }
        return lerpInSpace(seg.space, from, to, e);
      }
    } else {
      // spin segment: additive delta onto runningVal.
      const by = seg.to as number;

      if (seg.loop && t >= seg.endSec) {
        // Perpetual loop: linear continuation — same delta per full window.
        const dur = seg.endSec - seg.startSec;
        const totalProgress = dur > 0 ? (t - seg.startSec) / dur : 1;
        runningVal = segStart + by * totalProgress;
      } else if (t >= seg.endSec) {
        // Finite spin complete — hold at segStart + full delta.
        runningVal = segStart + by;
      } else {
        // Active spin window.
        const dur = seg.endSec - seg.startSec;
        const localT = dur > 0 ? (t - seg.startSec) / dur : 1;
        const e = EASE[seg.ease](localT);
        return segStart + by * e;
      }
    }
  }

  // All segments have ended — return the accumulated held value.
  return runningVal;
}

/**
 * evaluateBaseVec3 — evaluate the base layer for the `target` Vec3 channel.
 *
 * `target` only ever has `'tween'`/`setVec` segments (never spin). `seg.space`
 * is intentionally ignored here: world-space coordinates are always interpolated
 * component-wise in linear space (log-space and additive-angle semantics are
 * undefined for signed 3D positions).
 */
function evaluateBaseVec3(segments: BaseSegment[], startVal: Vec3, t: number): Vec3 {
  if (segments.length === 0) return [startVal[0], startVal[1], startVal[2]];

  // Compute component-wise running Vec3.
  let rx = startVal[0];
  let ry = startVal[1];
  let rz = startVal[2];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;

    if (t < seg.startSec) {
      return [rx, ry, rz];
    }

    const from = seg.from !== undefined ? (seg.from as Vec3) : ([rx, ry, rz] as Vec3);

    const to = seg.to as Vec3;

    if (t >= seg.endSec) {
      // Segment complete — hold at `to`.
      rx = to[0];
      ry = to[1];
      rz = to[2];
    } else {
      // Active tween — linear component-wise lerp.
      const dur = seg.endSec - seg.startSec;
      const localT = dur > 0 ? (t - seg.startSec) / dur : 1;
      const e = EASE[seg.ease](localT);
      return [lerp(from[0], to[0], e), lerp(from[1], to[1], e), lerp(from[2], to[2], e)];
    }
  }

  return [rx, ry, rz];
}

// ---------------------------------------------------------------------------
// Path layer — a flyPath supersedes the base layer for all four channels.
// ---------------------------------------------------------------------------

/**
 * activePathAt — the path that governs the base layer at time `t`, or null.
 *
 * A path governs from its `startSec` onward (not just within its window): once a
 * flythrough has started, it holds its final pose after `endSec` so the camera
 * does not snap back to the start pose during a trailing `hold`. When clips
 * chain multiple paths, the most recently started one wins.
 */
function activePathAt(paths: PathTrack[], t: number): PathTrack | null {
  let best: PathTrack | null = null;
  for (const p of paths) {
    if (p.startSec <= t && (best === null || p.startSec > best.startSec)) best = p;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * evaluateClip — evaluate the clip at `elapsedSec` seconds after its start.
 *
 * Compiles `data` on first call (memoised on reference identity); subsequent
 * calls with the same `data` reference reuse the cached `CompiledClip`.
 *
 * Returns a fresh `CameraPose` with a fresh `target` array — no aliasing with
 * any internal structure.
 *
 * @param data        The authored clip description.
 * @param elapsedSec  Seconds since the clip started (≥ 0).
 * @param frameBasis  The STEADY orientation-frame basis a `flyPath` encodes its
 *                    aim through (see `buildPathTrack`). Absent ⇒ identity
 *                    (world-frame aim) — the pre-feature behaviour, so a clip
 *                    with no `flyPath` is unaffected.
 * @returns           The camera pose at that instant.
 */
export function evaluateClip(data: ClipData, elapsedSec: number, frameBasis?: Mat3): CameraPose {
  const compiled = getCompiled(data, frameBasis);
  const { start, baseTracks } = compiled;
  const t = elapsedSec;

  // --- Base layer (a flyPath supersedes it for all four channels) ---
  const path = activePathAt(compiled.pathTracks, t);
  let baseDistance: number;
  let baseYaw: number;
  let basePitch: number;
  let baseTarget: Vec3;
  if (path !== null) {
    // Clamp into the path's own window: before it starts we never get here
    // (activePathAt requires startSec ≤ t); after it ends, hold the final pose.
    const localSec = Math.min(Math.max(t - path.startSec, 0), path.endSec - path.startSec);
    const pose = path.sample(localSec);
    baseDistance = pose.distance;
    baseYaw = pose.yaw;
    basePitch = pose.pitch;
    baseTarget = pose.target;
  } else {
    baseDistance = evaluateBaseScalar(baseTracks['distance'], start.distance, 'distance', t);
    baseYaw = evaluateBaseScalar(baseTracks['yaw'], start.yaw, 'yaw', t);
    basePitch = evaluateBaseScalar(baseTracks['pitch'], start.pitch, 'pitch', t);
    baseTarget = evaluateBaseVec3(baseTracks['target'], start.target, t);
  }

  // --- Velocity layer (displacement, additive) ---
  const velDist = velDisplacement(compiled, 'distance', t);
  const velYaw = velDisplacement(compiled, 'yaw', t);
  const velPitch = velDisplacement(compiled, 'pitch', t);
  // `rate` on 'target' is uncommon but structurally consistent — velDisplacement
  // returns 0 when no VelRamp exists for a channel, so this is a no-op by default.
  const velTarget = velDisplacement(compiled, 'target', t);

  // --- Oscillation layer (additive) ---
  const oscDist = oscOffset(compiled, 'distance', t);
  const oscYaw = oscOffset(compiled, 'yaw', t);
  const oscPitch = oscOffset(compiled, 'pitch', t);
  // A `target` osc track applies the same scalar offset to all three components
  // (the OscTrack model carries one amplitude, not per-axis amplitudes).
  const oscTarget = oscOffset(compiled, 'target', t);

  return {
    // Fresh target triple — never alias any input.
    target: [
      baseTarget[0] + velTarget + oscTarget,
      baseTarget[1] + velTarget + oscTarget,
      baseTarget[2] + velTarget + oscTarget,
    ],
    yaw: baseYaw + velYaw + oscYaw,
    pitch: basePitch + velPitch + oscPitch,
    distance: baseDistance + velDist + oscDist,
  };
}
