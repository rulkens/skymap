/**
 * surfaceController — the body arm's gesture register (spec §6). All of it
 * runs in body-fixed metres and reads no world position, so a fast clock
 * cannot slide the ground under a gesture.
 *
 * What the cursor is over picks the control model; every mode moves the pose
 * so the grabbed content follows the cursor, which fixes each sign below.
 * One orientation authority (R1): gestures never create roll, and every zoom
 * notch — both directions — walks heading north and roll level by one bounded
 * decay; a dive walks tilt to nadir, a recession only back inside the
 * altitude-keyed band, whose ceiling reaches 0 at the disengage boundary.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { InputStep } from '../../@types/camera/InputStep';
import type { SurfaceController } from '../../@types/camera/SurfaceController';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Vec4 } from '../../@types/math/Vec4';
import { ORIENT_DECAY } from '../../data/camera/orientDecay';
import { anchoredDragRotation, MIN_INCIDENCE_COS } from '../../utils/camera/anchoredDragRotation';
import { anchoredZoomStep } from '../../utils/camera/anchoredZoomStep';
import { blendedEnuAt } from '../../utils/camera/blendedEnuAt';
import { bodyUpWeight } from '../../utils/camera/bodyUpWeight';
import { cappedRotationToward } from '../../utils/camera/cappedRotationToward';
import { orientStepRad } from '../../utils/camera/orientStepRad';
import { refAzimuthOf } from '../../utils/camera/refAzimuthOf';
import { riddenOrientStepRad } from '../../utils/camera/riddenOrientStepRad';
import { cursorRayBodyLocal } from '../../utils/camera/cursorRayBodyLocal';
import { maxTiltRad } from '../../utils/camera/maxTiltRad';
import { rotateBasisByQuat } from '../../utils/camera/rotateBasisByQuat';
import { surfaceFloorM } from '../../utils/camera/surfaceFloorM';
import { cross3 } from '../../utils/math/cross3';
import { multiplyQuat } from '../../utils/math/multiplyQuat';
import { normalize3 } from '../../utils/math/normalize3';
import { quatFromAxisAngle } from '../../utils/math/quatFromAxisAngle';
import { raySphereRoots } from '../../utils/math/raySphereRoots';
import { rotateVec3ByQuat } from '../../utils/math/rotateVec3ByQuat';

const BODY_CENTRE: Vec3 = [0, 0, 0];
const BODY_POLE: Vec3 = [0, 0, 1];

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
 * The pose's orientation readout in the ENU at its own standpoint. `azimuthRad`
 * is what the user calls "how far off north the view is": read off screen-up
 * below 45° tilt and off forward above — their horizontal parts are cos(tilt)
 * and sin(tilt) long, so they trade places there. For a roll-free pose the two
 * agree; while an arriving roll is still bleeding out, the chosen one is the
 * user-visible residual (nulling forward's near nadir drove a measured polar
 * dive THROUGH north-up and back out to 79° off).
 */
type EyeFrame = {
  readonly localUp: Vec3;
  readonly tiltRad: number;
  readonly east: Vec3;
  readonly north: Vec3;
  readonly azimuthRad: number;
};

/**
 * The pose's orientation readout in the band-blended reference ENU
 * (`blendedEnuAt` — one home, shared with the debug readout): `blendW = 1` is
 * the pure body ENU (every drag site), lower weights swing north toward the
 * scene up across the hysteresis window (the zoom settle, round 5/6).
 */
function eyeFrameOf(
  pose: BodyFixedPose,
  blendW: number,
  sceneUpLocal: Readonly<Vec3>,
): EyeFrame | null {
  const eyeM = eyeOf(pose);
  if (Math.hypot(...eyeM) === 0) return null; // no ENU exists at the centre
  const localUp = normalize3(eyeM);
  const b = pose.basisLocal;
  const forward: Vec3 = [b[6], b[7], b[8]];
  const up: Vec3 = [b[3], b[4], b[5]];
  // The pose's own screen-up is the hold-and-transport carry: inside the
  // blend's singular neighbourhood the reference is wherever the settle
  // already put the view (round 7) — stateless, and consistent between the
  // pre-notch and post-notch measures because both read their own pose.
  const { east, north } = blendedEnuAt(localUp, blendW, sceneUpLocal, up);
  const fwdVert = dot3(forward, localUp);
  const tiltRad = Math.acos(Math.max(-1, Math.min(1, -fwdVert)));
  return {
    localUp,
    tiltRad,
    east,
    north,
    azimuthRad: refAzimuthOf(localUp, forward, up, east, north),
  };
}

/** The roll-free basis at `frame`'s standpoint with this azimuth and tilt. */
function canonicalBasisAt(frame: EyeFrame, azimuthRad: number, tiltRad: number): Mat3 {
  const { localUp, east, north } = frame;
  const ch = Math.cos(azimuthRad);
  const sh = Math.sin(azimuthRad);
  const ct = Math.cos(tiltRad);
  const st = Math.sin(tiltRad);
  const horiz: Vec3 = [
    north[0] * ch + east[0] * sh,
    north[1] * ch + east[1] * sh,
    north[2] * ch + east[2] * sh,
  ];
  const forward: Vec3 = [
    horiz[0] * st - localUp[0] * ct,
    horiz[1] * st - localUp[1] * ct,
    horiz[2] * st - localUp[2] * ct,
  ];
  const up: Vec3 = [
    horiz[0] * ct + localUp[0] * st,
    horiz[1] * ct + localUp[1] * st,
    horiz[2] * ct + localUp[2] * st,
  ];
  const right = cross3(forward, up);
  return [
    right[0],
    right[1],
    right[2],
    up[0],
    up[1],
    up[2],
    forward[0],
    forward[1],
    forward[2],
  ] as Mat3;
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

/**
 * The drag path's tilt authority. The gesture's OWN excess past the ceiling is
 * simply not granted (a wall the drag presses against — motion stops, nothing
 * snaps); excess the pose ARRIVED with (a flyby, a clip end, a ceiling that
 * moved under a held pose) eases out by the bounded decay instead — C1's
 * one-tick 113° clamp is unrepresentable. Applied as a delta rotation about
 * the eye (basis only): enforcement never moves the eye (T17), and turning by
 * the residual leaves any not-yet-bled roll alone rather than discarding it.
 */
function walledTiltPose(
  pose: BodyFixedPose,
  preTiltRad: number,
  bodyRadiusM: number,
): BodyFixedPose {
  const eyeM = eyeOf(pose);
  const eyeMagM = Math.hypot(...eyeM);
  if (eyeMagM === 0) return pose;
  const localUp = normalize3(eyeM);
  const b = pose.basisLocal;
  const forward: Vec3 = [b[6], b[7], b[8]];
  const vert = dot3(forward, localUp);
  const tiltRad = Math.acos(Math.max(-1, Math.min(1, -vert)));

  const ceilingRad = maxTiltRad(eyeMagM / bodyRadiusM - 1);
  const allowed = Math.min(tiltRad, Math.max(ceilingRad, Math.min(preTiltRad, tiltRad)));
  const target = allowed - orientStepRad(Math.max(0, allowed - ceilingRad));
  if (target >= tiltRad - 1e-15) return pose;

  // The residual's axis is the east of forward's own heading — `forward × up̂`
  // is `sin(tilt)` long along it; degenerate only at nadir, where tilt is 0.
  const axisRaw = cross3(forward, localUp);
  if (Math.hypot(...axisRaw) < 1e-12) return pose;
  // Turning by +φ about the east raises tilt, so the correction is negative.
  const q = quatFromAxisAngle(normalize3(axisRaw), target - tiltRad);
  return { ...pose, basisLocal: rotateBasisByQuat(q, pose.basisLocal) };
}

/**
 * The drag path's level settle: rotate the basis toward the roll-free pose at
 * its own standpoint, capped. Pan (and its limb continuation) passes the
 * heading it entered the step with, so a curved drag path cannot rotate the
 * image — holonomy roll is corrected the step it appears (R1: no gesture may
 * introduce roll), while an arriving roll eases out over a few inputs rather
 * than snapping. Below the cap the correction is FULL, which is what makes
 * gesture-created roll unrepresentable rather than merely damped.
 */
function levelledPose(pose: BodyFixedPose, heldAzimuthRad: number | null): BodyFixedPose {
  const frame = eyeFrameOf(pose, 1, BODY_POLE);
  if (frame === null) return pose;
  const target = canonicalBasisAt(frame, heldAzimuthRad ?? frame.azimuthRad, frame.tiltRad);
  const q = cappedRotationToward(pose.basisLocal, target, ORIENT_DECAY.capRad);
  if (q === null) return pose;
  return { ...pose, basisLocal: rotateBasisByQuat(q, pose.basisLocal) };
}

/**
 * The zoom path's orientation settle (R1 + rulings 5-7): every notch, both
 * directions, walks heading → north and roll → level by the one bounded
 * decay; the tilt target is the ruled asymmetry — a dive converges to NADIR
 * (ruling 5); a recession RIDES the altitude-keyed ceiling as a wall
 * (rulings 6 + C1): below `maxTiltRad` a notch out leaves tilt alone, and
 * each notch may squeeze by its own ceiling delta — proportionate to the
 * user's zoom, distributed strictly with progress, and structurally 0 at the
 * disengage boundary, which is what keeps the fold's retarget view-exact.
 * Only `inheritedTiltRad` — excess the zoom did NOT author (a clip/tour
 * arrival, a drag parked above the band) — eases by the capped decay instead.
 *
 * `diveAnchorM !== null` IS the dive: its corrections are rigid rotations
 * about axes THROUGH the anchor — camera-space coordinates invariant (Q4c),
 * the dived-on point pixel-locked, and the shrinking eye–anchor range lands
 * the corrections in full by the ground. A recession (null) turns the basis
 * about the EYE: anchor-pivoting there is self-defeating — the eye orbits
 * the anchor and the standpoint's own ENU turn cancels ~h/(R+h) of every
 * correction (measured: 0.071 rad commanded, 0.023 achieved at h = 2R) —
 * and FW-H never promised recession-orientation pixels anyway; the position
 * step above still pins the cursor point (ruling 7). The dive's heading axis
 * runs through the body centre too, so altitude is untouched; a tilt about a
 * surface anchor holds `|eye − anchor|`, not `|eye|`, hence the floor
 * resample at the end.
 */
function canonicalledPose(
  pose: BodyFixedPose,
  diveAnchorM: Readonly<Vec3> | null,
  bodyRadiusM: number,
  inheritedTiltRad: number,
  sceneUpLocal: Readonly<Vec3>,
  preBlendAzimuthRad: number | null,
): BodyFixedPose {
  let out = pose;
  // The reference up this settle norths toward is the BAND BLEND (round 5):
  // the body pole deep in, the scene up at the disengage boundary — so an
  // engaged recession hands the fold a scene-aligned screen-up by
  // construction, and the bake it commits carries ≈0 scene roll.
  const eyeM0 = eyeOf(out);
  if (Math.hypot(...eyeM0) === 0) return pose;
  const blendW = bodyUpWeight(Math.hypot(...eyeM0) / bodyRadiusM - 1);
  const f0 = eyeFrameOf(out, blendW, sceneUpLocal);
  if (f0 === null) return pose;
  // Dive: bounded decay toward north-of-ref — the ENU turning under a moving
  // eye is not notch-authored, so it eases (ruled smooth; near the anchor
  // `d(azimuth)/dδ ≈ −1`, further off scaled by `Â·up̂`, always the right
  // sign). Recession: the ONE settle discipline (`riddenOrientStepRad`,
  // ruling 10 — shared with the world arm's roll ride): the reference's own
  // band swing (and a cursor-anchored notch's ENU turn) is notch-authored and
  // rides; only deviation the zoom did not author (`preBlendAzimuthRad`,
  // measured at the pre-notch pose against ITS reference) decays, capped.
  // Feeding the whole residual to the decay is the freeze the round-5 sim
  // measured.
  const dPsi = diveAnchorM
    ? orientStepRad(f0.azimuthRad)
    : (() => {
        const dPre = preBlendAzimuthRad ?? f0.azimuthRad;
        const moveRaw = Math.atan2(Math.sin(f0.azimuthRad - dPre), Math.cos(f0.azimuthRad - dPre));
        return riddenOrientStepRad(dPre, moveRaw);
      })();
  if (dPsi !== 0) {
    const q = quatFromAxisAngle(diveAnchorM ? normalize3(diveAnchorM) : f0.localUp, dPsi);
    out = diveAnchorM ? rotatedAbout(out, q, BODY_CENTRE) : withBasis(out, q);
  }

  const f1 = eyeFrameOf(out, blendW, sceneUpLocal);
  if (f1 !== null) {
    let dTau: number;
    if (diveAnchorM) {
      dTau = orientStepRad(f1.tiltRad);
    } else {
      const eyeM = eyeOf(out);
      const ceilingRad = maxTiltRad(Math.hypot(...eyeM) / bodyRadiusM - 1);
      // The wall carries the inherited excess; the decay eats it, capped.
      // Load-bearing for `bodyUpWeight`'s scene-aligned bake: tilt 0 at
      // disengage is what makes the image plane the horizontal plane there,
      // so the blended "north" IS the world arm's screen-up at the handoff.
      const allowed = Math.min(f1.tiltRad, ceilingRad + inheritedTiltRad);
      const target = allowed - orientStepRad(Math.max(0, allowed - ceilingRad));
      dTau = f1.tiltRad - target;
    }
    const b = out.basisLocal;
    const axisRaw = cross3([b[6], b[7], b[8]], f1.localUp);
    if (dTau !== 0 && Math.hypot(...axisRaw) > 1e-12) {
      const q = quatFromAxisAngle(normalize3(axisRaw), -dTau);
      out = diveAnchorM ? rotatedAbout(out, q, diveAnchorM) : withBasis(out, q);
    }
  }

  const f2 = eyeFrameOf(out, blendW, sceneUpLocal);
  if (f2 !== null) {
    const q = cappedRotationToward(
      out.basisLocal,
      canonicalBasisAt(f2, f2.azimuthRad, f2.tiltRad),
      ORIENT_DECAY.capRad,
    );
    if (q !== null) out = diveAnchorM ? rotatedAbout(out, q, diveAnchorM) : withBasis(out, q);
  }
  return flooredPose(out, bodyRadiusM);
}

/** Turn the basis in place — the eye-pivot form of a settle rotation. */
function withBasis(pose: BodyFixedPose, q: Readonly<Vec4>): BodyFixedPose {
  return { ...pose, basisLocal: rotateBasisByQuat(q, pose.basisLocal) };
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

  // A miss is sky: free look. (R1 deleted the trackball's free rotation, and
  // with it the altitude tiebreak a miss used to consult — a pan that LEAVES
  // the disc mid-gesture degrades to the north-locked orbit instead.)
  if (pick === null) return { mode: 'look', anchorLocalM: null, anchorRadiusM: 0, prevPixel };

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
    // the orbit is the honest answer for a gesture already at the limb.
    const graze = pickOn(currRay, gesture.anchorRadiusM);
    mode = graze !== null && Math.abs(graze.incidence) < MIN_INCIDENCE_COS ? 'strafe' : 'orbit';
  }

  // One rate law for every screen-mapped mode: the angle the pixel delta
  // subtends at the lens, so a drag of one screen height is one FOV of turn at
  // every altitude and no tuning constant exists to be wrong. Height scales
  // both axes, so x and y move at the same rate.
  const yawRad = ((step.endPx[0] - gesture.prevPixel[0]) / viewportPx[1]) * fovYRad;
  const pitchRad = ((step.endPx[1] - gesture.prevPixel[1]) / viewportPx[1]) * fovYRad;
  const b = arm.basisLocal;
  const right: Vec3 = [b[0], b[1], b[2]];

  if (mode === 'orbit') {
    // The pan continued past the limb on the frozen sphere: the pose orbits
    // the centre AGAINST the drag, which is what carries the grabbed limb
    // along with the cursor. The level settle in `apply` holds the entry
    // heading, so this is the north-locked orbit, not a free trackball.
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
  sceneUpLocal: Readonly<Vec3>,
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
  // measures the zoom distance from. Note the two owners differ in anchor
  // LIFETIME by construction: a gesture holds its latch until it goes stale,
  // while at rest every tick re-picks through the same pixel — which converges
  // on the pointed-at ground point rather than drifting off it.
  const pixel: Readonly<Vec2> = gesture?.prevPixel ??
    cursorPx ?? [viewportPx[0] / 2, viewportPx[1] / 2];
  const cursorAnchorM =
    latched !== null && !stale
      ? latched
      : (pickOn(cursorRayBodyLocal(arm, pixel, viewportPx, fovYRad), bodyRadiusM)?.pointM ?? null);
  const stepped = anchoredZoomStep(arm, factor, cursorAnchorM, bodyRadiusM);
  // A dive at the sky has no ground point to converge over and keeps its
  // framing; a dive with one settles about it (pixel-locked). A recession
  // settles about the eye and needs no anchor at all.
  if (factor < 1 && cursorAnchorM === null) return stepped;
  // The pre-notch readout, against the pre-notch reference: excess the zoom
  // did NOT author (tilt above the ceiling from a clip/tour arrival or a
  // drag parked above the band — the wall carries it, only the capped decay
  // may spend it) and the azimuth deviation the recession ride preserves
  // rather than re-authoring.
  const hrPre = Math.hypot(...eyeOf(arm)) / bodyRadiusM - 1;
  const preInBlendFrame = eyeFrameOf(arm, bodyUpWeight(hrPre), sceneUpLocal);
  const inheritedRad =
    preInBlendFrame === null ? 0 : Math.max(0, preInBlendFrame.tiltRad - maxTiltRad(hrPre));
  return canonicalledPose(
    stepped,
    factor < 1 ? cursorAnchorM : null,
    bodyRadiusM,
    inheritedRad,
    sceneUpLocal,
    preInBlendFrame?.azimuthRad ?? null,
  );
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
    debugGesture: () => live,
    apply: (arm, step, viewportPx, fovYRad, bodyRadiusM, sceneUpLocal) => {
      if (step.kind === 'zoom') {
        return zoomStep(
          arm,
          live?.gesture ?? null,
          step.factor,
          step.cursorPx,
          viewportPx,
          fovYRad,
          bodyRadiusM,
          sceneUpLocal,
        );
      }
      // The gesture boundaries reach the controller through the two callbacks;
      // `drainInput` owns their store edges in the same pass.
      if (step.kind !== 'drag' || live === null) return arm;
      const gesture = live.gesture ?? latchFor(arm, step, viewportPx, fovYRad, bodyRadiusM);
      // The step's ENTRY orientation: the tilt the wall grandfathers, and the
      // heading pan transports. Drags level against the PURE body ENU — the
      // band blend is the zoom's authority; a drag-created deviation from the
      // blend is "unauthored" and the next notch's decay settles it.
      const preInPoleFrame = eyeFrameOf(arm, 1, BODY_POLE);
      const { pose, mode } = draggedPose(arm, gesture, step, viewportPx, fovYRad);
      live.gesture = { ...gesture, mode, prevPixel: step.endPx };
      // One floor site, after every position write — `anchoredZoomStep` owns
      // its own, so the zoom arm above is already floored. The wall and the
      // level run on the FLOORED pose: the floor moves the eye radially, and
      // the ENU they settle against has to be the final standpoint.
      const walled = walledTiltPose(
        flooredPose(pose, bodyRadiusM),
        preInPoleFrame?.tiltRad ?? 0,
        bodyRadiusM,
      );
      // Drags stay heading-free (ruled) — only zoom writes walk north up — but
      // no drag may ROLL: pan and orbit hold the heading they entered with
      // (the transport that makes holonomy unrepresentable), look and tilt
      // level around the heading they authored. Strafe translates with its
      // basis untouched — a known small hole in the no-roll rule: it lives in
      // a few-pixel grazing-incidence latch window at the limb, where a
      // standpoint translation does turn the ENU (~0.03 rad over 30 steps at
      // the boundary, measured); the next pan or notch settles the residual.
      if (mode === 'strafe' || preInPoleFrame === null) return walled;
      return levelledPose(
        walled,
        mode === 'pan' || mode === 'orbit' ? preInPoleFrame.azimuthRad : null,
      );
    },
  };
}
