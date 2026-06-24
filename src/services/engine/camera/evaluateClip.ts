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
 * `amp · sin(2π t / period)`. Additive with both base and velocity;
 * perpetual (runs for the clip's full lifetime). Multiple tracks on the same
 * channel are summed independently.
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
 * caches the result on `data` reference identity via a module-level
 * `WeakMap<ClipData, CompiledClip>`. Plan B's `playClip` driver will reuse
 * this same cache: calling `compileClip` once at registration time avoids
 * re-flattening the effect tree every frame.
 *
 * ### Purity
 *
 * - `data` and the cached `CompiledClip` are never mutated.
 * - The returned `CameraPose` allocates a fresh `target` triple each call.
 * - Same `(data, elapsedSec)` twice ⇒ deep-equal output.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { CompiledClip, BaseSegment, VelRamp } from '../../../@types/animation/CompiledClip';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Channel } from '../../../@types/animation/Channel';
import type { Ease } from '../../../@types/animation/Ease';
import type { Vec3 } from '../../../@types/math/Vec3';
import { compileClip } from '../animation/compileClip';
import { lerpInSpace } from '../animation/channelSpace';
import { EASE } from '../animation/ease';
import { lerpAngleShortest } from '../../../utils/math/lerpAngleShortest';
import { lerp } from '../../../utils/math/lerp';

// ---------------------------------------------------------------------------
// Module-level compile cache — keyed on ClipData reference identity.
// Plan B's playClip will reuse this same WeakMap.
// ---------------------------------------------------------------------------

const compileCache = new WeakMap<ClipData, CompiledClip>();

function getCompiled(data: ClipData): CompiledClip {
  const cached = compileCache.get(data);
  if (cached !== undefined) return cached;
  const compiled = compileClip(data);
  compileCache.set(data, compiled);
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

function oscOffset(compiled: CompiledClip, ch: Channel, t: number): number {
  let total = 0;
  for (const osc of compiled.oscTracks) {
    if (osc.channel !== ch) continue;
    total += osc.amp * Math.sin((2 * Math.PI * t) / osc.period);
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
function evaluateBaseVec3(
  segments: BaseSegment[],
  startVal: Vec3,
  t: number,
): Vec3 {
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

    const from =
      seg.from !== undefined
        ? (seg.from as Vec3)
        : ([rx, ry, rz] as Vec3);

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
 * @returns           The camera pose at that instant.
 */
export function evaluateClip(data: ClipData, elapsedSec: number): CameraPose {
  const compiled = getCompiled(data);
  const { start, baseTracks } = compiled;
  const t = elapsedSec;

  // --- Base layer ---
  const baseDistance = evaluateBaseScalar(baseTracks['distance'], start.distance, 'distance', t);
  const baseYaw = evaluateBaseScalar(baseTracks['yaw'], start.yaw, 'yaw', t);
  const basePitch = evaluateBaseScalar(baseTracks['pitch'], start.pitch, 'pitch', t);
  const baseTarget = evaluateBaseVec3(baseTracks['target'], start.target, t);

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
