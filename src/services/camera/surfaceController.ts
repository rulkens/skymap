/**
 * surfaceController — the body arm's gesture register (spec §6). All of it
 * runs in body-fixed metres and reads no world position, so a fast clock
 * cannot slide the ground under a gesture.
 *
 * What the cursor is over picks the control model; altitude is only a
 * tiebreak (C §5.1) — every mode moves the pose so the grabbed content
 * follows the cursor, which fixes each sign below. Altitude changes only
 * through zoom, and zoom re-levels through the tilt ceiling, so every
 * drivable path lands at tilt 0 by disengage — why the ceiling's zero sits
 * exactly at `SURFACE_REGIME.disengageHR` (spec §12-R3).
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { InputStep } from '../../@types/camera/InputStep';
import type { SurfaceController } from '../../@types/camera/SurfaceController';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Vec4 } from '../../@types/math/Vec4';
import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { anchoredDragRotation, MIN_INCIDENCE_COS } from '../../utils/camera/anchoredDragRotation';
import { anchoredZoomStep } from '../../utils/camera/anchoredZoomStep';
import { cursorRayBodyLocal } from '../../utils/camera/cursorRayBodyLocal';
import { headingTiltAt } from '../../utils/camera/headingTiltAt';
import { maxTiltRad } from '../../utils/camera/maxTiltRad';
import { rotateBasisByQuat } from '../../utils/camera/rotateBasisByQuat';
import { surfaceFloorM } from '../../utils/camera/surfaceFloorM';
import { mat3FromColumns } from '../../utils/math/mat3FromColumns';
import { multiplyQuat } from '../../utils/math/multiplyQuat';
import { normalize3 } from '../../utils/math/normalize3';
import { quatFromAxisAngle } from '../../utils/math/quatFromAxisAngle';
import { raySphereRoots } from '../../utils/math/raySphereRoots';
import { rotateVec3ByQuat } from '../../utils/math/rotateVec3ByQuat';

const BODY_CENTRE: Vec3 = [0, 0, 0];

type Ray = { readonly originM: Vec3; readonly dir: Vec3 };
type DragStep = Extract<InputStep, { kind: 'drag' }>;
/** `incidence` is `ray·normal` at the hit — 0 is edge-on. */
type Pick = { readonly pointM: Vec3; readonly incidence: number };

function dot3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function eyeOf(pose: BodyFixedPose): Vec3 {
  const { anchorLocalM: a, eyeRelAnchorM: e } = pose;
  return [a[0] + e[0], a[1] + e[1], a[2] + e[2]];
}

/** The nearest hit AHEAD of the eye; a hit behind it would grab the far side. */
function pickOn(ray: Ray, radiusM: number): Pick | null {
  const roots = raySphereRoots(ray.originM, ray.dir, BODY_CENTRE, radiusM);
  if (roots === null || roots[0] <= 0) return null;
  const t = roots[0];
  const pointM: Vec3 = [
    ray.originM[0] + ray.dir[0] * t,
    ray.originM[1] + ray.dir[1] * t,
    ray.originM[2] + ray.dir[2] * t,
  ];
  return { pointM, incidence: dot3(ray.dir, pointM) / radiusM };
}

/**
 * The descent floor, unconditional and resampled after the last position write
 * (spec §6, O §4). The push is radial, so it moves the eye without turning it —
 * the same reason `anchoredZoomStep` rescales rather than rotating (C §6.6's
 * "rotate the basis by the angle collision moved the eye" has zero angle here).
 * A tilt about a surface anchor holds `|eye − anchor|`, not `|eye|`, so without
 * this a long tilt drag walks the eye straight through the ground.
 */
function flooredPose(pose: BodyFixedPose, bodyRadiusM: number): BodyFixedPose {
  const eyeM = eyeOf(pose);
  const magM = Math.hypot(...eyeM);
  const floorM = surfaceFloorM(bodyRadiusM);
  // An eye exactly at the centre has no push direction; no bounded step reaches
  // it from a floored pose, and leaving it beats returning NaN.
  if (magM >= floorM || magM === 0) return pose;
  const scale = floorM / magM;
  const { anchorLocalM: a } = pose;
  return {
    ...pose,
    eyeRelAnchorM: [eyeM[0] * scale - a[0], eyeM[1] * scale - a[1], eyeM[2] * scale - a[2]],
  };
}

/**
 * The orientation ceiling (spec §6, §12-R3/R4b), enforced after every driven
 * write — never at arm entry, so a pose that arrives above it (a flyby, a
 * tour keyframe) is left alone until the user's own next gesture. Derives
 * its OWN eye-anchored ENU via `headingTiltAt` (never `surfaceReadoutOf`'s
 * screen-centre one, which snaps discontinuously when the forward ray misses
 * the sphere), and is a no-op below the ceiling, so it never disturbs a drag
 * mode's own roll — EXCEPT on the tick that first crosses it: the rebuild
 * below is a 2-parameter `(heading, tilt)` reconstruction with no roll term,
 * so whatever roll that write carried snaps to 0 in that one tick (measured
 * 45°→0 on a single wheel notch). Flagged for the Task 22 feel gate — the
 * spec's rebuild has nowhere to put the roll, so this isn't fixed here.
 *
 * `clampHeading` adds the north-up half on ZOOM writes (ruled 2026-09-01,
 * §12-R4b): the return to the canonical framing is a scale-keyed ceiling that
 * tightens with altitude, not an animated blend — the shape Google Maps
 * documents ("the range of angles varies with the current zoom level; values
 * outside are clamped") and the shape T17's tilt ceiling already is
 * (prior-art-cesium-ge.md Q3/Q4). `maxTiltRad` supplies BOTH limits: one
 * off-canonical-authority scalar, so tilt and heading can never disagree about
 * how constrained the pose is, and the disengage boundary stays one number.
 * Convergence is then emergent and distance-keyed — it stops when zooming
 * stops, has no overshoot, and cannot pop because there is no state to snap.
 * Drags stay heading-free (ruled): the clamp is a zoom write's business.
 *
 * The clamp turns the basis about the eye's local vertical. That is the
 * pixel-locking form (Q4c: a rigid rotation about an axis through the zoom
 * anchor holds the anchor's camera-space coordinates) exactly when the anchor
 * is the sub-eye point — i.e. on the recession, which is the only time this
 * clamp is active, since climbing is what tightens the ceiling.
 */
function ceilingEnforcedPose(
  pose: BodyFixedPose,
  bodyRadiusM: number,
  clampHeading: boolean,
): BodyFixedPose {
  const eyeM = eyeOf(pose);
  const eyeMagM = Math.hypot(...eyeM);
  if (eyeMagM === 0) return pose; // no ENU exists at the centre
  const localUp = normalize3(eyeM);

  const b = pose.basisLocal;
  const forward: Vec3 = [b[6], b[7], b[8]];
  const up: Vec3 = [b[3], b[4], b[5]];
  const { headingRad, tiltRad, east, north } = headingTiltAt(localUp, forward, up);

  const ceilingRad = maxTiltRad(eyeMagM / bodyRadiusM - 1);
  // `headingRad` is `atan2`'s (−π, π], so clamping its MAGNITUDE keeps the sign
  // and can never take the long way round the ±π seam.
  const headingLimit = clampHeading ? ceilingRad : Math.PI;
  const clampedHeading = Math.max(-headingLimit, Math.min(headingLimit, headingRad));
  if (tiltRad <= ceilingRad && clampedHeading === headingRad) return pose;

  const clampedTilt = Math.min(tiltRad, ceilingRad);
  const ch = Math.cos(clampedHeading);
  const sh = Math.sin(clampedHeading);
  const ct = Math.cos(clampedTilt);
  const st = Math.sin(clampedTilt);
  const horiz: Vec3 = [
    north[0] * ch + east[0] * sh,
    north[1] * ch + east[1] * sh,
    north[2] * ch + east[2] * sh,
  ];
  const newForward: Vec3 = [
    horiz[0] * st - localUp[0] * ct,
    horiz[1] * st - localUp[1] * ct,
    horiz[2] * st - localUp[2] * ct,
  ];
  const newUp: Vec3 = [
    horiz[0] * ct + localUp[0] * st,
    horiz[1] * ct + localUp[1] * st,
    horiz[2] * ct + localUp[2] * st,
  ];
  const newRight: Vec3 = [
    east[0] * ch - north[0] * sh,
    east[1] * ch - north[1] * sh,
    east[2] * ch - north[2] * sh,
  ];
  return { ...pose, basisLocal: mat3FromColumns(newRight, newUp, newForward) };
}

/** Turn the whole pose — eye and basis — about a body-fixed point. */
function rotatedAbout(
  pose: BodyFixedPose,
  q: Readonly<Vec4>,
  pivotM: Readonly<Vec3>,
): BodyFixedPose {
  const eyeM = eyeOf(pose);
  const relM = rotateVec3ByQuat(q, [eyeM[0] - pivotM[0], eyeM[1] - pivotM[1], eyeM[2] - pivotM[2]]);
  const { anchorLocalM: a } = pose;
  return {
    ...pose,
    eyeRelAnchorM: [
      pivotM[0] + relM[0] - a[0],
      pivotM[1] + relM[1] - a[1],
      pivotM[2] + relM[2] - a[2],
    ],
    basisLocal: rotateBasisByQuat(q, pose.basisLocal),
  };
}

function latchFor(
  arm: BodyFixedPose,
  step: DragStep,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
  bodyRadiusM: number,
): SurfaceGesture {
  const prevPixel = step.startPx;
  const pick = pickOn(cursorRayBodyLocal(arm, prevPixel, viewportPx, fovYRad), bodyRadiusM);

  // The secondary drag (right / middle button) is the tilt handle. Its anchor
  // falls back to the nadir footprint, so tilt always has a ground point to
  // orbit whatever the cursor is over.
  if (step.mode === 'pan') {
    const nadir = normalize3(eyeOf(arm));
    const anchorLocalM: Vec3 = pick?.pointM ?? [
      nadir[0] * bodyRadiusM,
      nadir[1] * bodyRadiusM,
      nadir[2] * bodyRadiusM,
    ];
    return { mode: 'tilt', anchorLocalM, anchorRadiusM: Math.hypot(...anchorLocalM), prevPixel };
  }

  if (pick === null) {
    // The design's only altitude tiebreak. `maxTiltRad` crosses 90° at about
    // `engageHR`, so below it the view can be aimed at real sky and a miss
    // means sky; above it the ceiling holds the view down and a miss is
    // off-limb space, where the trackball is the honest control.
    const hOverR = Math.hypot(...eyeOf(arm)) / bodyRadiusM - 1;
    const mode = hOverR > SURFACE_REGIME.engageHR ? 'trackball' : 'look';
    return { mode, anchorLocalM: null, anchorRadiusM: 0, prevPixel };
  }

  return {
    // At grazing incidence the rotation that satisfies the drag is a teleport,
    // so the gesture strafes in the anchor's plane instead (C §6.4).
    mode: Math.abs(pick.incidence) < MIN_INCIDENCE_COS ? 'strafe' : 'pan',
    anchorLocalM: pick.pointM,
    anchorRadiusM: Math.hypot(...pick.pointM),
    prevPixel,
  };
}

function draggedPose(
  arm: BodyFixedPose,
  gesture: SurfaceGesture,
  step: DragStep,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
): { readonly pose: BodyFixedPose; readonly mode: SurfaceGesture['mode'] } {
  const currRay = cursorRayBodyLocal(arm, step.endPx, viewportPx, fovYRad);
  let mode = gesture.mode;

  if (mode === 'pan') {
    const prevRay = cursorRayBodyLocal(arm, gesture.prevPixel, viewportPx, fovYRad);
    const rotated = anchoredDragRotation(arm, prevRay, currRay, gesture.anchorRadiusM);
    if (rotated !== null) return { pose: rotated, mode };
    // A null answer covers a miss AND a grazing hit, and the two degrade
    // differently (C §2.6 / §6.4), so the incidence is re-measured here —
    // against the frozen sphere, never the display readout. Sticky either way.
    // The CURRENT ray decides alone: when it was the previous one that grazed,
    // trackball is the honest answer for a gesture already at the limb.
    const graze = pickOn(currRay, gesture.anchorRadiusM);
    mode = graze !== null && Math.abs(graze.incidence) < MIN_INCIDENCE_COS ? 'strafe' : 'trackball';
  }

  // One rate law for every screen-mapped mode: the angle the pixel delta
  // subtends at the lens, so a drag of one screen height is one FOV of turn at
  // every altitude and no tuning constant exists to be wrong. Height scales
  // both axes, so x and y move at the same rate.
  const yawRad = ((step.endPx[0] - gesture.prevPixel[0]) / viewportPx[1]) * fovYRad;
  const pitchRad = ((step.endPx[1] - gesture.prevPixel[1]) / viewportPx[1]) * fovYRad;
  const b = arm.basisLocal;
  const right: Vec3 = [b[0], b[1], b[2]];

  if (mode === 'trackball') {
    // The pose orbits the centre AGAINST the drag, which is what carries the
    // grabbed limb along with the cursor.
    const up: Vec3 = [b[3], b[4], b[5]];
    const q = multiplyQuat(quatFromAxisAngle(right, -pitchRad), quatFromAxisAngle(up, -yawRad));
    return { pose: rotatedAbout(arm, q, BODY_CENTRE), mode };
  }

  if (mode === 'look') {
    // Yaw about the LOCAL vertical rather than the camera's own up: that is
    // what keeps the horizon level at every latitude and azimuth (probe
    // defect 3). The eye is not touched — this is the only route to the sky.
    const q = multiplyQuat(
      quatFromAxisAngle(right, pitchRad),
      quatFromAxisAngle(normalize3(eyeOf(arm)), yawRad),
    );
    return { pose: { ...arm, basisLocal: rotateBasisByQuat(q, arm.basisLocal) }, mode };
  }

  const anchorM = gesture.anchorLocalM;
  // Both modes below latch an anchor, so this only keeps the arm total.
  if (anchorM === null) return { pose: arm, mode };

  if (mode === 'strafe') {
    // The plane through the anchor with the view axis as its normal (C §2.8):
    // translate by anchor − (this pixel's hit on it). Absolute against the
    // latched anchor, not incremental, so a long gesture accumulates no drift.
    const n: Vec3 = [b[6], b[7], b[8]];
    const denom = dot3(currRay.dir, n);
    if (denom === 0) return { pose: arm, mode };
    const t = (dot3(anchorM, n) - dot3(currRay.originM, n)) / denom;
    const e = arm.eyeRelAnchorM;
    return {
      pose: {
        ...arm,
        eyeRelAnchorM: [
          e[0] + anchorM[0] - (currRay.originM[0] + currRay.dir[0] * t),
          e[1] + anchorM[1] - (currRay.originM[1] + currRay.dir[1] * t),
          e[2] + anchorM[2] - (currRay.originM[2] + currRay.dir[2] * t),
        ],
      },
      mode,
    };
  }

  // Tilt, in the intrinsic Z-X-Z order KML specifies: heading about the
  // anchor's local up, THEN tilt about the ALREADY-YAWED east. Tilting about a
  // fixed screen axis instead drags ~10° of unwanted heading per 60 px (probe).
  const upLocal = normalize3(anchorM);
  const heading = quatFromAxisAngle(upLocal, yawRad);
  const radial = dot3(right, upLocal);
  const eastM = normalize3([
    right[0] - upLocal[0] * radial,
    right[1] - upLocal[1] * radial,
    right[2] - upLocal[2] * radial,
  ]);
  // Inverted at this input mapping, not in the rotation math: Google Earth's
  // right-drag convention is drag-down ⇒ tilt UP toward the horizon, the
  // opposite sign from `pitchRad`'s screen-space (down-is-positive) origin.
  const q = multiplyQuat(quatFromAxisAngle(rotateVec3ByQuat(heading, eastM), -pitchRad), heading);
  return { pose: rotatedAbout(arm, q, anchorM), mode };
}

function zoomStep(
  arm: BodyFixedPose,
  gesture: SurfaceGesture | null,
  factor: number,
  cursorPx: Readonly<Vec2> | null,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
  bodyRadiusM: number,
): BodyFixedPose {
  const latched = gesture?.anchorLocalM ?? null;
  // Past the anchor's own tangent plane the anchor is behind the horizon and
  // zooming toward it is a teleport, so the pick is taken fresh (C §6.7). The
  // test runs every tick rather than latching a flag — the zoom owns no state
  // of its own (FW-B).
  const stale = latched !== null && dot3(eyeOf(arm), normalize3(latched)) < Math.hypot(...latched);
  // At rest the wheel's own cursor pixel is the pick (user ruling, §12-R4);
  // during a gesture the drag's last pixel is the more current one. Only a
  // pinch supplies neither, and its screen-centre pick is the point C §3.1
  // measures the zoom distance from.
  const pixel: Readonly<Vec2> = gesture?.prevPixel ??
    cursorPx ?? [viewportPx[0] / 2, viewportPx[1] / 2];
  const cursorAnchorM =
    latched !== null && !stale
      ? latched
      : (pickOn(cursorRayBodyLocal(arm, pixel, viewportPx, fovYRad), bodyRadiusM)?.pointM ?? null);
  return anchoredZoomStep(arm, factor, cursorAnchorM, bodyRadiusM);
}

export function createSurfaceController(): SurfaceController {
  // `null` ⇔ no pointer is down. The inner gesture stays null until the first
  // drag step, the first input carrying the press pixel a latch needs; nesting
  // them makes "latched with the pointer up" — FW-C's trackpad burst —
  // unrepresentable rather than guarded.
  let live: { gesture: SurfaceGesture | null } | null = null;

  return {
    onGestureStart: () => {
      live = { gesture: null };
    },
    onGestureEnd: () => {
      live = null;
    },
    apply: (arm, step, viewportPx, fovYRad, bodyRadiusM) => {
      if (step.kind === 'zoom') {
        const zoomed = zoomStep(
          arm,
          live?.gesture ?? null,
          step.factor,
          step.cursorPx,
          viewportPx,
          fovYRad,
          bodyRadiusM,
        );
        // The heading limit rides the RECESSION only. The ceiling tightening
        // with altitude was meant to make that automatic, and the tilt half is
        // — but a dive near nadir generates heading faster than descending
        // slackens the limit (forward's horizontal component is the lean, and
        // it swings to π as the eye slides off the sub-anchor point), so a
        // direction-blind clamp turns the view mid-dive: measured 0.37 rad of
        // anchor drift over a 30-notch descent, breaking the first ruling.
        return ceilingEnforcedPose(zoomed, bodyRadiusM, step.factor > 1);
      }
      // The gesture boundaries reach the controller through the two callbacks;
      // `drainInput` owns their store edges in the same pass.
      if (step.kind !== 'drag' || live === null) return arm;
      const gesture = live.gesture ?? latchFor(arm, step, viewportPx, fovYRad, bodyRadiusM);
      const { pose, mode } = draggedPose(arm, gesture, step, viewportPx, fovYRad);
      live.gesture = { ...gesture, mode, prevPixel: step.endPx };
      // One floor site, after every position write — `anchoredZoomStep` owns
      // its own, so the zoom arm above is already floored. Ceiling runs on
      // the FLOORED pose: the floor moves the eye radially, and the ENU the
      // ceiling enforces against has to be the final standpoint, not the
      // pre-floor one.
      // `false`: a drag owns its own heading — only a zoom write returns the
      // view to north-up (ruled, §12-R4b).
      return ceilingEnforcedPose(flooredPose(pose, bodyRadiusM), bodyRadiusM, false);
    },
  };
}
