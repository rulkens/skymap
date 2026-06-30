/**
 * buildPathTrack — compile a `flyPath`'s waypoints into an evaluable `PathTrack`.
 *
 * This is where the flythrough cinematography lives. It runs ONCE at clip
 * compile time and returns a `sample(localSec)` closure the per-frame evaluator
 * calls. Four concerns are kept separate (decomplected) and composed here:
 *
 *   1. **Geometry — the EYE flies a centripetal Catmull-Rom** through the knots
 *      `[liveEye, ...waypoints]` (knot 0 is the camera's current world position,
 *      so the path flies out of wherever the camera is). The CAMERA rides the
 *      spline — we do NOT orbit it around a splined target: a trailing eye curls
 *      a loop around each waypoint when the framing distance is comparable to the
 *      gaps between groups (the "slingshot"). With the eye ON the curve it never
 *      swings around anything. Knot TIMES are spaced by chord-length^0.5
 *      (centripetal, α=0.5): uniform spacing overshoots when knots are unevenly
 *      spaced (a far start, tight groups), while centripetal provably never cusps
 *      or self-intersects.
 *
 *   2. **Aim — look down the path** ("toward the place it's moving to") with a
 *      built-in align-in. The camera turns to face its direction of travel: at
 *      each knot we take the path's forward tangent (chord through neighbouring
 *      knots) and convert it to the (yaw, pitch) that AIMS along it
 *      (`orbitAnglesLookingAlong`), splined as the aim channels. Because the
 *      first leg can be long (a cosmic fly-in), easing the aim across the WHOLE
 *      leg turns too slowly to "arrive" looking at the first waypoint; instead a
 *      short fixed `ALIGN_SEC` window blends from the LIVE orientation into the
 *      forward aim, so the camera snaps to face the journey early, then tracks
 *      the path. The blend starts at the live pose (no aim pop on handoff). A
 *      waypoint may pin `yaw`/`pitch` to override the forward default. The
 *      look-at `target` the renderer needs is derived back from eye + aim.
 *
 *   3. **Arc-length reparametrisation (scale space)** — raw spline parameter is
 *      not perceptually uniform: lerping it blows through the near field and
 *      crawls in the far. We sample the curve, measure arc length in SCALE
 *      space — lateral motion normalised by distance (angular size) plus radial
 *      motion in log-distance — and invert it, so equal progress is equal
 *      perceived motion.
 *
 *   4. **Timing** — per-leg `over` seconds set when the camera reaches each
 *      waypoint. Unpinned legs split the remaining time by arc-length share
 *      (uniform speed, the default). A monotone cubic through (cumulativeTime,
 *      arcFraction) maps time → progress without ever drifting backward, and the
 *      global `ease` warps the whole leg's accel/decel on top (rest at the ends
 *      for a clean dwell handoff).
 *
 * A path STOPS nowhere: a dwell is a separate beat, layered after. Over-pinned
 * legs (pinned seconds ≥ total) throw here, loudly, at compile time.
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { PathTrack, PathSample } from '../../../@types/animation/CompiledClip';
import type { Ease } from '../../../@types/animation/Ease';
import type { Vec3 } from '../../../@types/math/Vec3';
import { catmullRomNonUniform } from '../../../utils/math/catmullRomNonUniform';
import { monotoneCubic } from '../../../utils/math/monotoneCubic';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { lerp } from '../../../utils/math/lerp';
import { trapezoidEase } from '../../../utils/math/trapezoidEase';
import { EASE } from './ease';

/** A waypoint after focus resolution — always concrete (`at` + `distance`). */
type AtWaypoint = {
  readonly at: Vec3;
  readonly distance: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly over?: number;
};

type BuildParams = {
  readonly start: CameraPose;
  readonly startSec: number;
  readonly over: number;
  readonly ease: Ease;
  readonly waypoints: readonly AtWaypoint[];
  /** Align-in seconds override (default `ALIGN_SEC`); see the field on the flyPath effect. */
  readonly align?: number;
  /** Seconds of ease ramp each end; when > 0, replaces the named `ease` envelope. */
  readonly rampSec?: number;
};

// Spline samples per leg for the arc-length table. 64 is plenty for a smooth
// camera curve; a knot lands exactly on a sample (index = leg · STEP).
const STEP = 64;

// Floor for a zero-length chord so the centripetal interval (chord^0.5) and the
// non-uniform basis never divide by zero on a degenerate (coincident) knot.
const CHORD_EPS = 1e-9;

// Built-in "align-in": seconds to blend from the live orientation into the
// forward (down-the-path) aim at the start. Short and fixed (not tied to the
// first leg's length) so the camera turns to face the journey promptly even
// when the first leg is a long cosmic fly-in. Capped at half the total below.
const ALIGN_SEC = 1.2;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function chord(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function buildPathTrack(params: BuildParams): PathTrack {
  const { start, startSec, over, ease, waypoints, align, rampSec } = params;

  if (waypoints.length === 0) {
    throw new Error('buildPathTrack: a flyPath needs at least one waypoint.');
  }
  for (const wp of waypoints) {
    if (!('at' in wp)) {
      throw new Error('buildPathTrack: unresolved waypoint — resolveClipFoci must run first.');
    }
  }

  const nLegs = waypoints.length;
  const nKnots = nLegs + 1;

  // --- Eye knots: knot 0 is the LIVE eye position, then each waypoint ---
  //
  // The CAMERA flies this spline (not a target it orbits). Knot 0 is where the
  // camera actually is right now — derived from the start pose via the orbit
  // convention eye = target + distance · dir(yaw, pitch) — so t=0 is pinned to
  // the live camera with no positional pop.
  const cp0 = Math.cos(start.pitch);
  const liveEye: Vec3 = [
    start.target[0] + start.distance * (cp0 * Math.sin(start.yaw)),
    start.target[1] + start.distance * Math.sin(start.pitch),
    start.target[2] + start.distance * (cp0 * Math.cos(start.yaw)),
  ];
  const knotPos: Vec3[] = [liveEye, ...waypoints.map((w) => [w.at[0], w.at[1], w.at[2]] as Vec3)];

  // --- Settle framed on the destination (the final waypoint) ---
  //
  // En-route waypoints are pass-points: the eye flies through their centres.
  // The final waypoint is the DESTINATION — the take should END framed on it,
  // not sail past it. So the final eye knot is pulled back from the group centre
  // along the approach direction by the framing distance: the eye arrives at
  // `framingDistance` from the centre, and because the pulled-back eye stays
  // collinear with the approach, the forward aim (computed below) looks straight
  // at the centre and the derived look-at `target` lands on it. Clamped to the
  // leg length so a very short final leg can't push the eye behind the prior
  // knot (a degenerate where the group is closer than its own framing distance).
  const lastCenter = knotPos[nKnots - 1]!;
  const prevKnot = knotPos[nKnots - 2]!;
  const approach: Vec3 = [
    lastCenter[0] - prevKnot[0],
    lastCenter[1] - prevKnot[1],
    lastCenter[2] - prevKnot[2],
  ];
  const legLen = Math.hypot(approach[0], approach[1], approach[2]);
  if (legLen > CHORD_EPS) {
    const backoff = Math.min(waypoints[nLegs - 1]!.distance, legLen);
    const ux = approach[0] / legLen;
    const uy = approach[1] / legLen;
    const uz = approach[2] / legLen;
    knotPos[nKnots - 1] = [
      lastCenter[0] - backoff * ux,
      lastCenter[1] - backoff * uy,
      lastCenter[2] - backoff * uz,
    ];
  }

  // --- Per-channel knot values (tx/ty/tz are the EYE path) ---
  const tx = knotPos.map((p) => p[0]);
  const ty = knotPos.map((p) => p[1]);
  const tz = knotPos.map((p) => p[2]);
  // Guard the start distance: a `'live'`-start clip is compiled once with the
  // zero-pose placeholder (distance 0 → ln(0) = −∞) before the player resolves
  // the real pose and recompiles. The placeholder compile is never rendered, so
  // a finite floor keeps the arc table NaN-free without affecting real plays.
  const ld = [
    Math.log(Math.max(start.distance, 1e-9)),
    ...waypoints.map((w) => Math.log(w.distance)),
  ];

  // --- Aim channels: forward-looking at every knot, with per-waypoint overrides ---
  //
  // The forward tangent at a knot is the chord through its neighbours (central
  // difference). Knot 0 looks toward the first waypoint; the last knot uses the
  // incoming chord. The live orientation is NOT a knot here — it is blended in
  // over ALIGN_SEC inside `sample`, so the aim aligns to the path promptly
  // rather than creeping across a long first leg.
  const forwardAt = (k: number): { yaw: number; pitch: number } => {
    const prev = k === 0 ? knotPos[0]! : knotPos[k - 1]!;
    const next = k === nKnots - 1 ? knotPos[k]! : knotPos[k + 1]!;
    const fwd: Vec3 = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]];
    return orbitAnglesLookingAlong(fwd);
  };
  const yaw: number[] = [];
  const pitch: number[] = [];
  for (let k = 0; k < nKnots; k++) {
    const wp = k === 0 ? undefined : waypoints[k - 1]!;
    const fwd = wp?.yaw === undefined || wp?.pitch === undefined ? forwardAt(k) : null;
    yaw.push(wp?.yaw ?? fwd!.yaw);
    pitch.push(wp?.pitch ?? fwd!.pitch);
  }
  // Unwrap yaw so Catmull-Rom interpolates the SHORT way around the circle
  // (never spins ±2π because two adjacent knots straddle the ±π seam).
  for (let k = 1; k < nKnots; k++) {
    while (yaw[k]! - yaw[k - 1]! > Math.PI) yaw[k]! -= 2 * Math.PI;
    while (yaw[k]! - yaw[k - 1]! < -Math.PI) yaw[k]! += 2 * Math.PI;
  }

  // --- Centripetal knot times: τ₀=0, τₖ₊₁ = τₖ + chord(knotₖ, knotₖ₊₁)^0.5 ---
  const tau: number[] = [0];
  for (let k = 0; k < nLegs; k++) {
    const c = Math.max(chord(knotPos[k]!, knotPos[k + 1]!), CHORD_EPS);
    tau.push(tau[k]! + Math.sqrt(c));
  }

  // Extend a real knot array (length nKnots) with duplicated endpoints so every
  // real segment has four control knots. Phantom knot times mirror the adjacent
  // interval (never coincident → the non-uniform basis stays well-defined).
  const exTau = [
    tau[0]! - (tau[1]! - tau[0]!),
    ...tau,
    tau[nKnots - 1]! + (tau[nKnots - 1]! - tau[nKnots - 2]!),
  ];
  const extend = (v: number[]): number[] => [v[0]!, ...v, v[nKnots - 1]!];
  const exTx = extend(tx);
  const exTy = extend(ty);
  const exTz = extend(tz);
  const exLd = extend(ld);
  const exYaw = extend(yaw);
  const exPitch = extend(pitch);

  // Evaluate one channel's centripetal Catmull-Rom at global parameter τ.
  // `seg` is the real segment index (0..nLegs-1); ex-arrays are offset by 1, so
  // segment `seg` reads ex-indices seg..seg+3 (real knots seg-1..seg+2).
  const evalCh = (exVal: number[], seg: number, t: number): number =>
    catmullRomNonUniform(
      exVal[seg]!,
      exVal[seg + 1]!,
      exVal[seg + 2]!,
      exVal[seg + 3]!,
      exTau[seg]!,
      exTau[seg + 1]!,
      exTau[seg + 2]!,
      exTau[seg + 3]!,
      t,
    );

  const segOf = (t: number): number => {
    let seg = 0;
    while (seg < nLegs - 1 && t > tau[seg + 1]!) seg++;
    return seg;
  };

  type Raw = { tx: number; ty: number; tz: number; ld: number; yaw: number; pitch: number };
  const poseAtTau = (t: number): Raw => {
    const seg = segOf(t);
    return {
      tx: evalCh(exTx, seg, t),
      ty: evalCh(exTy, seg, t),
      tz: evalCh(exTz, seg, t),
      ld: evalCh(exLd, seg, t),
      yaw: evalCh(exYaw, seg, t),
      pitch: evalCh(exPitch, seg, t),
    };
  };

  // --- Arc-length table in scale space (sampled per leg in τ) ---
  const nSamples = STEP * nLegs + 1;
  const cumArc = new Float64Array(nSamples);
  const paramOf = new Float64Array(nSamples);
  paramOf[0] = tau[0]!;
  let prev = poseAtTau(tau[0]!);
  let idx = 0;
  for (let leg = 0; leg < nLegs; leg++) {
    for (let s = 1; s <= STEP; s++) {
      const t = lerp(tau[leg]!, tau[leg + 1]!, s / STEP);
      idx++;
      const cur = poseAtTau(t);
      const dx = cur.tx - prev.tx;
      const dy = cur.ty - prev.ty;
      const dz = cur.tz - prev.tz;
      const lateral = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const midDist = Math.exp(0.5 * (cur.ld + prev.ld));
      const dLog = cur.ld - prev.ld;
      const angular = lateral / midDist; // lateral motion in radians ≈ scale-invariant
      const ds = Math.sqrt(angular * angular + dLog * dLog);
      cumArc[idx] = cumArc[idx - 1]! + ds;
      paramOf[idx] = t;
      prev = cur;
    }
  }
  const totalArc = cumArc[nSamples - 1]! || 1; // guard a zero-length path

  // Arc fraction at each knot (knot k lands on sample k·STEP).
  const knotArcFrac: number[] = [];
  for (let k = 0; k < nKnots; k++) knotArcFrac.push(cumArc[k * STEP]! / totalArc);

  // Invert the arc table: arc fraction u → spline param τ.
  const paramAtArcFrac = (u: number): number => {
    const targetArc = clamp01(u) * totalArc;
    let lo = 0;
    let hi = nSamples - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumArc[mid]! < targetArc) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return paramOf[0]!;
    const a0 = cumArc[lo - 1]!;
    const a1 = cumArc[lo]!;
    const f = a1 > a0 ? (targetArc - a0) / (a1 - a0) : 0;
    return lerp(paramOf[lo - 1]!, paramOf[lo]!, f);
  };

  // --- Per-leg time allocation ---
  const legArcFrac = (j: number): number => knotArcFrac[j + 1]! - knotArcFrac[j]!;
  const pinned = waypoints.map((w) => w.over);
  const fixedSum = pinned.reduce<number>((acc, o) => acc + (o ?? 0), 0);
  const unpinned = pinned.filter((o) => o === undefined).length;

  const dur: number[] = new Array(nLegs);
  if (unpinned > 0) {
    const remaining = over - fixedSum;
    if (remaining <= 0) {
      throw new Error(
        `flyPath: pinned legs total ${fixedSum}s, leaving no time for ${unpinned} unpinned leg(s) ` +
          `in a ${over}s path. Raise the total \`over\` or lower the pinned legs.`,
      );
    }
    let unpinnedArc = 0;
    for (let j = 0; j < nLegs; j++) if (pinned[j] === undefined) unpinnedArc += legArcFrac(j);
    for (let j = 0; j < nLegs; j++) {
      if (pinned[j] !== undefined) dur[j] = pinned[j]!;
      else dur[j] = remaining * (unpinnedArc > 0 ? legArcFrac(j) / unpinnedArc : 1 / unpinned);
    }
  } else {
    if (Math.abs(fixedSum - over) > 1e-6) {
      throw new Error(
        `flyPath: every leg pins its \`over\` but they sum to ${fixedSum}s, not the declared total ${over}s. ` +
          `Set the total \`over\` to ${fixedSum}, or leave a leg unpinned.`,
      );
    }
    for (let j = 0; j < nLegs; j++) dur[j] = pinned[j]!;
  }

  // Cumulative knot times → timing curve (time → arc fraction), monotone.
  const knotTime: number[] = [0];
  for (let j = 0; j < nLegs; j++) knotTime.push(knotTime[j]! + dur[j]!);
  const timing = monotoneCubic(knotTime, knotArcFrac);

  // --- Align-in: blend the live orientation into the forward aim at the start ---
  const liveYaw = start.yaw;
  const livePitch = start.pitch;
  const alignSec = Math.min(align ?? ALIGN_SEC, over * 0.5); // never exceed half the take

  // Global time envelope: a trapezoidal speed profile with `rampSec`-long ramps
  // each end (tunable in seconds) when set, else the named cubic `ease`. The
  // trapezoid takes a ramp FRACTION, so convert rampSec → rampSec/over (it
  // clamps the fraction to ≤ 0.5 internally). Both reach rest at the ends, so
  // the settle still hands off cleanly to a dwell.
  const warp =
    rampSec !== undefined && rampSec > 0
      ? (s: number): number => trapezoidEase(s, rampSec / over)
      : (s: number): number => EASE[ease](s);
  // Shortest-arc yaw blend so the initial turn takes the short way round.
  const blendYaw = (from: number, to: number, w: number): number => {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return from + d * w;
  };

  const sample = (localSec: number): PathSample => {
    const s = clamp01(localSec / over);
    const easedTime = warp(s) * over;
    const u = clamp01(timing(easedTime));
    const t = paramAtArcFrac(u);
    const pose = poseAtTau(t);

    // Align-in: 0 → live orientation, 1 → the splined forward aim.
    const w = EASE['inOut'](clamp01(localSec / alignSec));
    const yawV = blendYaw(liveYaw, pose.yaw, w);
    const pitchV = livePitch + (pose.pitch - livePitch) * w;

    // The spline IS the eye path. Derive the look-at target the renderer needs:
    // updatePosition sets eye = target + distance · dir(yaw, pitch), so to land
    // the eye on (tx,ty,tz) we set target = eye − distance · dir.
    const dist = Math.exp(pose.ld);
    const cp = Math.cos(pitchV);
    const dir: Vec3 = [cp * Math.sin(yawV), Math.sin(pitchV), cp * Math.cos(yawV)];
    return {
      target: [pose.tx - dist * dir[0], pose.ty - dist * dir[1], pose.tz - dist * dir[2]],
      distance: dist,
      yaw: yawV,
      pitch: pitchV,
    };
  };

  return { startSec, endSec: startSec + over, sample };
}
