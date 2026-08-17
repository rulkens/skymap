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
 *      With `lookAhead > 0` the aim instead points from the eye toward the eye
 *      `lookAhead` seconds AHEAD on the path: a causal flythrough then flies
 *      straight in looking head-on, and leads toward the next subject the instant
 *      the path bends past a waypoint (supersedes per-waypoint aim pins). A
 *      `passBy` config flies the eye PAST interior subjects rather than through
 *      them: the interior knots are offset laterally off-centre so each subject
 *      slides by instead of being rammed.
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
 *   5. **Dwell (`linger` + `lingerSec`)** — a sustained slow-down window around
 *      each target that ADDS wall-clock time (see `buildDwellWarp`). The camera
 *      cruises at constant speed, then crawls across a plateau near each waypoint
 *      — slow before it swims into view, slow after — settling on `totalSec ≥
 *      over`. It is a pure wall→base time remap layered under the envelope; the
 *      geometry is untouched.
 *
 * Over-pinned legs (pinned seconds ≥ total) throw here, loudly, at compile time.
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { PathTrack, PathSample } from '../../../@types/animation/CompiledClip';
import type { Ease } from '../../../@types/animation/Ease';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { SplineConfig } from '../../../@types/animation/SplineConfig';
import type { PassByConfig } from '../../../@types/animation/PassByConfig';
import type { PassByDir } from '../../../@types/animation/PassByDir';
import { catmullRomNonUniform } from '../../../utils/math/catmullRomNonUniform';
import { causalHermiteNonUniform } from '../../../utils/math/causalHermiteNonUniform';
import { monotoneCubic } from '../../../utils/math/monotoneCubic';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { yawPitchToDir } from '../../../utils/camera/yawPitchToDir';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { lerp } from '../../../utils/math/lerp';
import { trapezoidEase } from '../../../utils/math/trapezoidEase';
import { buildDwellWarp } from './buildDwellWarp';
import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_TURN_DELAY,
  DEFAULT_LOOK_AHEAD,
  DEFAULT_PASS_BY_DIR,
} from './pathDefaults';
import { EASE } from './ease';

/** A waypoint after focus resolution — always concrete (`at` + `distance`). */
type AtWaypoint = {
  readonly at: Vec3;
  readonly distance: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly over?: number;
  /** Per-target brake depth ∈ [0,1]; overrides the path-level `linger`. */
  readonly linger?: number;
  /** Subject world radius (Mpc); the unit `passBy.offset` scales by. */
  readonly radius?: number;
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
  /** Path-level dwell DEPTH ∈ [0,1] applied at every target; per-waypoint `linger` overrides it. */
  readonly linger?: number;
  /** Dwell window width in WALL-CLOCK seconds — how long the slow moment lasts per target, whatever the depth. */
  readonly lingerSec?: number;
  /**
   * Which spline basis to fit (default `{ kind: 'centripetal' }`). The
   * `causalHermite` arm carries the turn-delay (overshoot) and look-ahead knobs;
   * `centripetal` carries neither. See `SplineConfig`.
   */
  readonly spline?: SplineConfig;
  /**
   * How to fly PAST interior galaxy waypoints instead of through their centres
   * (lateral offset + direction). Omit for through-centre. See `PassByConfig`.
   */
  readonly passBy?: PassByConfig;
  /**
   * The STEADY orientation-frame basis this clip was compiled under
   * (`ORIENTATION_FRAMES[settings.orientation]`). The path's world-space forward
   * tangents are ENCODED to (yaw, pitch) through it (`orbitAnglesLookingAlong`)
   * so the render-path decode through the same basis aims the camera down the
   * world path. Absent ⇒ identity (world-frame aim), so the pre-feature callers
   * and every direct test are byte-identical.
   */
  readonly frameBasis?: Mat3;
};

// Spline samples per leg for the arc-length table. 64 is plenty for a smooth
// camera curve; a knot lands exactly on a sample (index = leg · STEP).
const STEP = 64;

// Floor for a zero-length chord so the centripetal interval (chord^0.5) and the
// non-uniform basis never divide by zero on a degenerate (coincident) knot.
const CHORD_EPS = 1e-9;

// Fallback "align-in" seconds for a direct caller that passes no `align`
// (the flyPath helper always supplies `DEFAULT_ALIGN_SEC`). Short and fixed
// (not tied to the first leg's length) so the camera turns to face the journey
// promptly even when the first leg is a long cosmic fly-in. Capped at half the
// total below.
const ALIGN_SEC = DEFAULT_ALIGN_SEC;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function chord(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// --- Small Vec3 helpers for the pass-by offset geometry ---
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm3(a: Vec3): Vec3 {
  const m = Math.hypot(a[0], a[1], a[2]);
  return m > CHORD_EPS ? [a[0] / m, a[1] / m, a[2] / m] : [0, 0, 0];
}
/** Component of `a` perpendicular to the UNIT vector `t`. */
const perp3 = (a: Vec3, t: Vec3): Vec3 => {
  const d = dot3(a, t);
  return [a[0] - d * t[0], a[1] - d * t[1], a[2] - d * t[2]];
};
const isZero3 = (a: Vec3): boolean => a[0] === 0 && a[1] === 0 && a[2] === 0;

/**
 * passByDirVec — the UNIT lateral direction to offset an interior eye knot so it
 * flies past the subject at knot `cK` rather than through it. `cPrev`/`cNext` are
 * the neighbouring centres (the travel tangent is their chord). See `PassByDir`.
 * `frameBasis` supplies the reference up (the frame pole via `frameUp`; world +Y
 * absent a basis) so the lateral axes track the active orientation frame.
 */
function passByDirVec(
  cPrev: Vec3,
  cK: Vec3,
  cNext: Vec3,
  mode: PassByDir,
  frameBasis?: Mat3,
): Vec3 {
  const t = norm3(sub3(cNext, cPrev)); // travel tangent
  const up0 = frameUp(frameBasis);
  // The lateral axes come from the shared image-plane basis about the travel
  // tangent: `above` is its screen-up axis, `screenSide` its screen-right axis.
  const above = (): Vec3 => {
    const { up } = imagePlaneBasis(t, 0, up0);
    const n: Vec3 = [up[0], up[1], up[2]];
    return isZero3(n) ? [1, 0, 0] : n; // travel is vertical → arbitrary lateral
  };
  switch (mode) {
    case 'above':
      return above();
    case 'screenSide': {
      const { right } = imagePlaneBasis(t, 0, up0);
      const r: Vec3 = [right[0], right[1], right[2]];
      return isZero3(r) ? [1, 0, 0] : r;
    }
    case 'outsideBend': {
      // Path acceleration points INTO the bend; the outside is its negation.
      const accel: Vec3 = [
        cPrev[0] + cNext[0] - 2 * cK[0],
        cPrev[1] + cNext[1] - 2 * cK[1],
        cPrev[2] + cNext[2] - 2 * cK[2],
      ];
      const inside = norm3(perp3(accel, t));
      return isZero3(inside) ? above() : [-inside[0], -inside[1], -inside[2]]; // ~straight leg → above
    }
  }
}

export function buildPathTrack(params: BuildParams): PathTrack {
  const { start, startSec, over, ease, waypoints, align, rampSec, linger, frameBasis } = params;
  // Normalize the basis + its causal-only knobs. centripetal carries neither, so
  // turnDelay is irrelevant and lookAhead is forced to 0 (no lead); the causal
  // arm fills each from the knob or its builder default.
  const cfg: SplineConfig = params.spline ?? { kind: 'centripetal' };
  const splineKind = cfg.kind;
  const turnDelay =
    cfg.kind === 'causalHermite' ? (cfg.turnDelay ?? DEFAULT_TURN_DELAY) : DEFAULT_TURN_DELAY;
  const lookAhead = cfg.kind === 'causalHermite' ? (cfg.lookAhead ?? DEFAULT_LOOK_AHEAD) : 0;

  // Fly-past: absent (or offset 0) flies the eye through each interior waypoint
  // centre — the historical behaviour. See `PassByConfig`.
  const passOffset = params.passBy?.offset ?? 0;
  const passDir = params.passBy?.dir ?? DEFAULT_PASS_BY_DIR;

  // Dwell window width (seconds). 0 (the direct-call default) = no dwell, so
  // `linger` depth alone does nothing — a dwell needs both a depth AND a window.
  const lingerSec = params.lingerSec ?? 0;

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
  // the live camera with no positional pop. `dir` decodes frame-LOCAL; rotate
  // into world by `frameBasis` (tight column-major product, mirroring
  // `updatePosition.ts`) so this knot lands where the renderer's eye actually is.
  const liveDir = rotateVec3ByTightMat3(yawPitchToDir(start.yaw, start.pitch), frameBasis);
  const liveEye: Vec3 = [
    start.target[0] + start.distance * liveDir[0],
    start.target[1] + start.distance * liveDir[1],
    start.target[2] + start.distance * liveDir[2],
  ];
  const knotPos: Vec3[] = [liveEye, ...waypoints.map((w) => [w.at[0], w.at[1], w.at[2]] as Vec3)];

  // --- Fly-past: displace interior eye knots off their subject centres ---
  //
  // Knot 0 (live eye) and the last knot (the destination, settle-framed below)
  // are left alone; each INTERIOR knot is pushed `offset · radius` off its centre
  // along the chosen perpendicular, so the eye sweeps PAST the subject instead of
  // through it. Directions are computed from the ORIGINAL centres in one pass
  // (a snapshot), so an earlier offset can't skew a later knot's tangent. A knot
  // with no subject radius (a hand-placed `atPoint`) is never offset.
  if (passOffset > 0) {
    const centres = knotPos.map((p) => [p[0], p[1], p[2]] as Vec3);
    for (let k = 1; k < nKnots - 1; k++) {
      const r = waypoints[k - 1]!.radius;
      if (r === undefined || r <= 0) continue;
      const n = passByDirVec(centres[k - 1]!, centres[k]!, centres[k + 1]!, passDir, frameBasis);
      const d = passOffset * r;
      knotPos[k] = [
        centres[k]![0] + d * n[0],
        centres[k]![1] + d * n[1],
        centres[k]![2] + d * n[2],
      ];
    }
  }

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
  // The forward tangent at a knot is, in centripetal mode, the chord through its
  // neighbours (central difference): knot 0 looks toward the first waypoint, the
  // last knot uses the incoming chord, and interior knots bank toward the next.
  // In causal-Hermite mode the forward at an INTERIOR knot is the INCOMING chord
  // alone (head-on arrival — the turn happens after); knot 0 and the last knot
  // are identical to centripetal either way. The live orientation is NOT a knot
  // here — it is blended in over ALIGN_SEC inside `sample`, so the aim aligns to
  // the path promptly rather than creeping across a long first leg.
  const forwardAt = (k: number): { yaw: number; pitch: number } => {
    let prev: Vec3;
    let next: Vec3;
    if (splineKind === 'causalHermite' && k > 0) {
      prev = knotPos[k - 1]!;
      next = knotPos[k]!; // incoming chord → look straight down the approach
    } else {
      prev = k === 0 ? knotPos[0]! : knotPos[k - 1]!;
      next = k === nKnots - 1 ? knotPos[k]! : knotPos[k + 1]!;
    }
    const fwd: Vec3 = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]];
    return orbitAnglesLookingAlong(fwd, frameBasis);
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

  // Evaluate one channel's spline at global parameter τ. `seg` is the real
  // segment index (0..nLegs-1); ex-arrays are offset by 1, so segment `seg` reads
  // ex-indices seg..seg+3 (real knots seg-1..seg+2). Both bases read the same
  // 4-knot window; the causal Hermite ignores the forward knot (seg+3).
  const evalCh =
    splineKind === 'causalHermite'
      ? (exVal: number[], seg: number, t: number): number =>
          causalHermiteNonUniform(
            exVal[seg]!,
            exVal[seg + 1]!,
            exVal[seg + 2]!,
            exVal[seg + 3]!,
            exTau[seg]!,
            exTau[seg + 1]!,
            exTau[seg + 2]!,
            exTau[seg + 3]!,
            t,
            turnDelay,
          )
      : (exVal: number[], seg: number, t: number): number =>
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

  // --- Dwell: a sustained slow-down window around each target (ADDS time) ---
  //
  // `linger` ∈ [0,1] is the dwell DEPTH; `lingerSec` the window width. Knot 0
  // (the live eye) is never a target, so it never dwells; each waypoint takes its
  // own `linger` or the path-level default. `buildDwellWarp` turns these into a
  // wall-clock → base-time map: the camera cruises 1:1 everywhere, then crawls
  // across a plateau around each knot — decelerating BEFORE it (so the target is
  // already slow as it swims into view) and accelerating AFTER — which lengthens
  // the take to `totalSec`. Cruise speed stays constant; depth 1 is a finite
  // crawl, never a freeze. `linger 0` (or `lingerSec 0`) → identity (`totalSec`
  // = `over`), so an un-dwelled path is byte-unchanged.
  const knotDepth = [0, ...waypoints.map((w) => clamp01(w.linger ?? linger ?? 0))];
  const dwell = buildDwellWarp(knotTime, knotDepth, lingerSec, over);
  const totalSec = dwell.totalSec;

  // --- Align-in: blend the live orientation into the forward aim at the start ---
  const liveYaw = start.yaw;
  const livePitch = start.pitch;
  const alignSec = Math.min(align ?? ALIGN_SEC, totalSec * 0.5); // never exceed half the take

  // Global time envelope: a trapezoidal speed profile with `rampSec`-long ramps
  // each end (tunable in seconds) when set, else the named cubic `ease`. The
  // trapezoid takes a ramp FRACTION, so convert rampSec → rampSec/over (it
  // clamps the fraction to ≤ 0.5 internally). Both reach rest at the ends, so
  // the settle still hands off cleanly to a dwell.
  const warp =
    rampSec !== undefined && rampSec > 0
      ? (s: number): number => trapezoidEase(s, rampSec / totalSec)
      : (s: number): number => EASE[ease](s);
  // Shortest-arc yaw blend so the initial turn takes the short way round.
  const blendYaw = (from: number, to: number, w: number): number => {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return from + d * w;
  };

  // localSec → spline parameter τ, through the full time pipeline (envelope over
  // the dwelled `totalSec`, wall→base dwell warp, arc-length inversion). Pulled
  // out of `sample` so the look-ahead aim can re-evaluate the EYE at a future
  // time with the same map.
  const paramAtLocalSec = (localSec: number): number => {
    const s = clamp01(localSec / totalSec);
    const easedWall = warp(s) * totalSec;
    const baseTime = dwell.baseTimeAt(easedWall);
    const u = clamp01(timing(baseTime));
    return paramAtArcFrac(u);
  };
  const eyePosAt = (localSec: number): Vec3 => {
    const p = poseAtTau(paramAtLocalSec(localSec));
    return [p.tx, p.ty, p.tz];
  };

  // Look-ahead aim: the look points from the eye now toward the eye `lookAhead`
  // seconds ahead. As the destination nears, the probe runs out of runway (`tB`
  // clamps to the end), so `lead` decays 1 → 0 and the aim blends back to the
  // exact splined forward aim — which frames the destination centre precisely —
  // for a clean settle. The aim yaw is anchored to the (unwrapped, continuous)
  // splined forward yaw, so it stays seam-continuous without frame-to-frame state.
  const aheadAim = (localSec: number, splinedYaw: number, splinedPitch: number) => {
    if (lookAhead <= 0) return { yaw: splinedYaw, pitch: splinedPitch };
    const tB = Math.min(localSec + lookAhead, totalSec);
    const lead = clamp01((tB - localSec) / lookAhead); // 1 in the body, → 0 at the end
    if (lead <= 0) return { yaw: splinedYaw, pitch: splinedPitch };
    const eyeA = eyePosAt(localSec);
    const eyeB = eyePosAt(tB);
    const fwd: Vec3 = [eyeB[0] - eyeA[0], eyeB[1] - eyeA[1], eyeB[2] - eyeA[2]];
    if (Math.hypot(fwd[0], fwd[1], fwd[2]) < CHORD_EPS) {
      return { yaw: splinedYaw, pitch: splinedPitch };
    }
    const a = orbitAnglesLookingAlong(fwd, frameBasis);
    return {
      yaw: blendYaw(splinedYaw, a.yaw, lead),
      pitch: splinedPitch + (a.pitch - splinedPitch) * lead,
    };
  };

  const sample = (localSec: number): PathSample => {
    const t = paramAtLocalSec(localSec);
    const pose = poseAtTau(t);
    const aim = aheadAim(localSec, pose.yaw, pose.pitch);

    // Align-in: 0 → live orientation, 1 → the path aim (splined forward, or the
    // look-ahead direction when `lookAhead` > 0).
    const w = EASE['easeInOutCubic'](clamp01(localSec / alignSec));
    const yawV = blendYaw(liveYaw, aim.yaw, w);
    const pitchV = livePitch + (aim.pitch - livePitch) * w;

    // The spline IS the eye path. Derive the look-at target the renderer needs:
    // updatePosition sets eye = target + distance · dir(yaw, pitch) — rotated
    // into world by `frameBasis` — so to land the eye on (tx,ty,tz) we set
    // target = eye − distance · dir, through the same rotation.
    const dist = Math.exp(pose.ld);
    const dir = rotateVec3ByTightMat3(yawPitchToDir(yawV, pitchV), frameBasis);
    return {
      target: [pose.tx - dist * dir[0], pose.ty - dist * dir[1], pose.tz - dist * dir[2]],
      distance: dist,
      yaw: yawV,
      pitch: pitchV,
    };
  };

  return { startSec, endSec: startSec + totalSec, sample };
}
