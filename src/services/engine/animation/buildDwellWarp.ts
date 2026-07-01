/**
 * buildDwellWarp — the flyPath "dwell" as an add-time reparametrisation of the
 * cruise timeline.
 *
 * ### The problem it solves
 *
 * A flythrough wants to LINGER on each galaxy — slow right down so the viewer
 * gets a good look — then speed back up. The naive way (a velocity dip pinned to
 * the knot) has two faults: the slow moment lands exactly ON the waypoint (too
 * late — you want to be already slow as it swims into view), and at full strength
 * it eases to a dead stop and jerks back up (a zero-slope cusp). Neither reads as
 * "dwell".
 *
 * ### The model
 *
 * A dwell is a sustained speed PLATEAU across a WINDOW around each interior knot,
 * and it ADDS time to the take (constant cruise everywhere else). We express it
 * as a monotone map wall-clock time → base (cruise) time:
 *
 *   - `slowness(baseTime)` = wall-seconds spent per base-second. It is 1 in
 *     cruise (base and wall advance together) and rises to a plateau inside each
 *     window, so the camera covers less base-progress per wall-second there — it
 *     crawls. `smoothstep` shoulders ramp it up and down, so there is no kink and
 *     (crucially) no zero-slope freeze.
 *   - `wall(baseTime) = ∫ slowness` maps `[0, over] → [0, totalSec]`, strictly
 *     increasing (slowness ≥ 1), so it inverts. `baseTimeAt` is that inverse.
 *
 * ### The window LEADS the knot (biased before, not centred)
 *
 * With look-ahead aim the camera looks DOWN the path, so a target is framed
 * ahead of you on APPROACH and slides behind once you pass it. So the slow-down
 * must lead the knot — be slowest while the target is still ahead in view, then
 * recover as you pass. `DWELL_LEAD_FRAC` shifts the plateau centre earlier by
 * that fraction of the half-window; the tail barely crosses the knot.
 *
 * Depth 1 caps at a finite crawl (`MIN_SPEED_FRAC` of cruise), never 0 — the fix
 * for the old dead-stop. The geometry (spline, arc-length, aim) is untouched:
 * dwell only decides HOW LONG the camera spends near each knot, and the caller
 * feeds `baseTimeAt(easedWall)` into the existing arc-length timing curve.
 */

import { smoothstep } from '../../../utils/math/smoothstep';

export type DwellWarp = {
  /** Wall-clock length of the dwelled take (`over` when there is no dwell). */
  readonly totalSec: number;
  /** Map a wall-clock second to its base (cruise) time in `[0, over]`. */
  readonly baseTimeAt: (wallSec: number) => number;
};

/** Slowest the crawl ever gets, as a fraction of cruise speed (depth 1). */
const MIN_SPEED_FRAC = 0.12;

/**
 * How far the slow plateau LEADS the knot, as a fraction of the half-window.
 * 0 centres it on the knot; 1 ends the window at the knot (fully on approach).
 * ~0.7 puts the slowest moment on approach — while the target is framed ahead —
 * with a short tail just past the knot.
 */
const DWELL_LEAD_FRAC = 0.7;

/** Additive slowness at a knot's plateau for a depth ∈ [0,1]. 0 → 0 (no dwell). */
function plateauSlowness(depth: number): number {
  const d = depth <= 0 ? 0 : depth >= 1 ? 1 : depth;
  if (d === 0) return 0;
  const speedFrac = 1 - d * (1 - MIN_SPEED_FRAC); // 1 → MIN_SPEED_FRAC as d: 0 → 1
  return 1 / speedFrac - 1;
}

/**
 * Build the dwell warp for a cruise timeline whose knots arrive at `knotTime`
 * (base seconds, `knotTime[0] === 0`, last `=== over`) with per-knot `depth`
 * (∈ [0,1]; index 0 is the live eye and should be 0). `windowSec` is the dwell
 * window width in base seconds. Returns the identity warp when nothing dwells.
 */
export function buildDwellWarp(
  knotTime: readonly number[],
  depth: readonly number[],
  windowSec: number,
  over: number,
): DwellWarp {
  const half = windowSec / 2;
  const amps = depth.map(plateauSlowness);
  const anyDwell = half > 0 && amps.some((a) => a > 0);
  if (!anyDwell) {
    return { totalSec: over, baseTimeAt: (w) => (w < 0 ? 0 : w > over ? over : w) };
  }

  // slowness(τ) = 1 + Σ knots  ampₖ · pulseₖ(τ). The pulse is 1 at its centre,
  // smoothly 0 at the window edge (flat top from smoothstep's zero-slope ends).
  // The centre LEADS the knot by `lead`, so the crawl sits on the approach.
  const lead = DWELL_LEAD_FRAC * half;
  const slowness = (tau: number): number => {
    let s = 1;
    for (let k = 0; k < knotTime.length; k++) {
      if (amps[k]! <= 0) continue;
      const x = Math.abs(tau - (knotTime[k]! - lead));
      if (x >= half) continue;
      s += amps[k]! * (1 - smoothstep(0, half, x));
    }
    return s;
  };

  // Integrate slowness over base-time to get the wall-clock table, then invert.
  const M = Math.max(256, (knotTime.length - 1) * 128);
  const dTau = over / M;
  const wall = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) {
    const mid = (i - 0.5) * dTau; // midpoint rule
    wall[i] = wall[i - 1]! + slowness(mid) * dTau;
  }
  const totalSec = wall[M]!;

  const baseTimeAt = (wallSec: number): number => {
    if (wallSec <= 0) return 0;
    if (wallSec >= totalSec) return over;
    let lo = 0;
    let hi = M;
    while (lo < hi) {
      const midIdx = (lo + hi) >> 1;
      if (wall[midIdx]! < wallSec) lo = midIdx + 1;
      else hi = midIdx;
    }
    const w1 = wall[lo]!;
    const w0 = wall[lo - 1]!;
    const f = w1 > w0 ? (wallSec - w0) / (w1 - w0) : 0;
    return (lo - 1 + f) * dTau;
  };

  return { totalSec, baseTimeAt };
}
