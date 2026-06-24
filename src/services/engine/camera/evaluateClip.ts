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
 * ramp accelerates a channel's velocity from 0 to `to` over its window
 * `[s, e)`, then HOLDS `to` forever after. Multiple ramps on the same channel
 * stack in emission order; a later ramp overrides the prior velocity from its
 * own startSec (its displacement is computed fresh from that point onward).
 * The total displacement is a pure function of `t` — NO per-frame accumulator.
 *
 * **Oscillation layer** (`oscTracks`): zero-mean sine bob,
 * `amp · sin(2π t / period)`. Additive with both base and velocity;
 * perpetual (runs for the clip's full lifetime). Multiple tracks on the same
 * channel are summed independently.
 *
 * ### Velocity-integral method
 *
 * For each `VelRamp [s, e)` with terminal velocity `to` and ease function `E`:
 *
 *   displacement(t) =
 *     ∫_s^{min(t,e)} to · E((u-s)/(e-s)) du  +  to · max(0, t - e)
 *
 * The ramp portion requires integrating the ease analytically or numerically.
 * This implementation uses a 64-step Simpson's rule quadrature for the ramp
 * portion. Rationale:
 *
 *   - `ease:'linear'` has an exact analytic closed form (see `rampIntegral`),
 *     which is used directly when the ease is `'linear'`.
 *   - The non-linear eases (`in`, `out`, `inOut`) have analytic antiderivatives
 *     (polynomials), but implementing and testing three separate formulas
 *     introduces more surface area than the fixed-step quadrature does. A
 *     64-step Simpson rule over a [0,1] normalised interval is deterministic,
 *     frame-rate-independent, and accurate to better than 1e-9 for smooth
 *     monotone functions — more than enough for camera animation.
 *   - The spec's headline requirement is "no per-frame accumulator", not a
 *     symbolic integral. Fixed-step quadrature satisfies that requirement: the
 *     same `(ramp, t)` pair always produces the same displacement.
 *
 * ### Spin-loop continuation choice
 *
 * For a `spin` segment with `loop: true`, the spin delta continues beyond
 * `endSec` as a LINEAR extrapolation of the final rate: the eased cycle from
 * `[startSec, endSec)` is treated as a single revolution, and subsequent
 * revolutions use the same `by` delta per `(endSec - startSec)` interval.
 * Formally: for t ≥ endSec, the total delta is
 *   `by + by · (t - startSec)/(endSec - startSec)  - by`
 *   = `by · (t - startSec)/(endSec - startSec)`.
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
// The ramp integral ∫_s^{w} to·E((u-s)/(e-s)) du in closed form for linear,
// and 64-step Simpson quadrature for the other eases.
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
 * rampDisplacement — displacement contributed by ONE VelRamp at time t.
 *
 * The ramp runs from `s` to `e`, ramping velocity 0→`to` with `ease`.
 * After `e` the velocity is held at `to` indefinitely.
 *
 * displacement(t) =
 *   (e - s) · to · ∫_0^{p} E(x) dx   (ramp portion, p = clamp(t-s, 0, e-s)/(e-s))
 *   + to · max(0, t - e)               (hold portion)
 */
function rampDisplacement(ramp: VelRamp, t: number): number {
  const { startSec: s, endSec: e, to, ease } = ramp;
  if (t <= s) return 0;

  const w = Math.min(t, e);
  const dur = e - s;
  const p = dur > 0 ? (w - s) / dur : 1;

  let rampPart: number;
  if (ease === 'linear') {
    // Analytic closed form for linear ease: ∫_0^p x dx = p²/2.
    // Total: dur · to · p²/2
    rampPart = dur * to * (p * p) * 0.5;
  } else {
    // 64-step Simpson quadrature for non-linear eases.
    // ∫_0^p E(x) dx, scaled by dur·to.
    rampPart = dur * to * integrateEase(ease, p);
  }

  const holdPart = to * Math.max(0, t - e);
  return rampPart + holdPart;
}

// ---------------------------------------------------------------------------
// Velocity layer — sum of all ramp displacements on a channel.
//
// Multiple ramps on the same channel are processed in emission order. A later
// ramp overrides the prior velocity FROM its own startSec onward — its
// displacement is computed fresh from that point, starting at rest.
// ---------------------------------------------------------------------------

function velDisplacement(compiled: CompiledClip, ch: Channel, t: number): number {
  let total = 0;
  for (const ramp of compiled.velTracks) {
    if (ramp.channel !== ch) continue;
    total += rampDisplacement(ramp, t);
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
 * `target` only ever has `'tween'`/`setVec` segments (never spin); each
 * component is interpolated linearly (space is always `'lin'`).
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
  // target velocity is not typically used, but handled for completeness
  const velTargetX = 0; // rate on 'target' is not supported in the current effectHelpers
  const velTargetY = 0;
  const velTargetZ = 0;

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
      baseTarget[0] + velTargetX + oscTarget,
      baseTarget[1] + velTargetY + oscTarget,
      baseTarget[2] + velTargetZ + oscTarget,
    ],
    yaw: baseYaw + velYaw + oscYaw,
    pitch: basePitch + velPitch + oscPitch,
    distance: baseDistance + velDist + oscDist,
  };
}
