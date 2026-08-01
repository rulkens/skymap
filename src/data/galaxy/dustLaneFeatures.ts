/**
 * buildDustLaneFeatures — the detail-tier dust splat network's first class
 * (design doc N2 #1): sharp absorption ridges hugging each spiral arm's
 * INNER edge, the density-wave shock lane. Pure `(geometry, dust, seed) ->
 * flat data`, no engine state, no per-frame CPU work — same discipline as
 * `sfEventCatalog.ts`, so this is a Worker/compute-shader candidate once
 * galaxies need to keep generating while the camera navigates.
 *
 * `armOffsetFrameAt`/`buildArmOffsetCurve`/`armLaneWidthAndAmplitude`/
 * `armAgeWeight` are exported so `dustNetworkFeatures.ts`'s spur/bubble/bead
 * classes place themselves on this exact curve and ledger rather than
 * re-deriving either.
 *
 * PURITY INVARIANT: no reads of engine/render state, no Date/Math.random —
 * every bit of variation comes from `seed`. Violating this makes a repack
 * order-dependent in a way that would only show up as a flicker in the field.
 */
import {
  armCrossSigma,
  armFadeEnvelope,
  armRidgeAngle,
  armRidgeCurvePoint,
} from './armRidgeGeometry';
import { discLightScaleLength } from '../../utils/galaxy/discLightScaleLength';
import { armCarriedFraction } from '../../utils/galaxy/armCarriedFraction';
import { warpSurfaceFrame } from '../../utils/galaxy/warpSurfaceFrame';
import { dustFaceOnColumn } from './galaxyDustMixture';
import type { GalaxyDustFeature } from '../../@types/galaxy/GalaxyDustFeature';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldArmRecord } from '../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../@types/math/Vec3';

/** Ridge samples per arm, matching `pushArmRidges`' previously-approved ~28 blobs/arm density. */
const STEPS_PER_ARM = 28;

/**
 * Runaway-input guard: never hand the shader more than this many lane quads.
 * The overall network cap (`dustNetworkFeatures.ts`'s
 * `DUST_NETWORK_FEATURE_CAP`) is what sizes `fieldFeatsBuf`'s starting
 * capacity now; this narrower cap survives as the lane class' own bound.
 */
export const DUST_LANE_FEATURE_CAP = 256;

/**
 * Measured lane-to-tracer offset family (150-315 pc, ~250 pc at the MW's
 * h_light 2.605 kpc — research doc s17 GAP, secondary-sourced only): as a
 * fraction of `discLightScaleLength`, 250/2605 ≈ 0.096.
 */
const OFFSET_FRACTION = 0.096;

/**
 * PHANGS lanes are a fraction of the stellar arm's own cross-section width —
 * a quarter, eyeballed against M74/NGC 628 (no primary-verified lane WIDTH
 * exists; see the design doc's "Measured anchors" GAP note). This scales
 * `armCrossSigma` down to the RENDERED lane's sigma; `armCarriedFraction`
 * below deliberately does NOT apply it — contrast `armContrast` is measured
 * over the arm's own physical footprint, not this narrower visible slice of it.
 */
const LANE_WIDTH_FRACTION = 0.25;

/** Sharp, not Gaussian-soft — the M74 "sharp lanes and fine detail" requirement (N1). Also the placeholder for kind 1/2 records, whose shader path hardcodes its own exponents. */
export const EDGE_SHARPNESS = 4.0;

/** Young arms carry more of the network's molecular dust than old ones; the floor keeps old arms faintly laned rather than bare. */
const AGE_WEIGHT_FLOOR = 0.25;
const AGE_WEIGHT_SPAN = 0.75;

/** Noise wavelength target, as a fraction of one segment's own length. */
export const NOISE_WAVELENGTH_FRACTION = 0.2;

/** Taper length at a chain's two free ends, as a fraction of that end's own segment length; matches the old per-segment window's own fraction. */
export const TAPER_FRACTION = 0.15;

const TAU_ROOT = Math.sqrt(2 * Math.PI);

/** `armCrossSigma` only reads `.armWidthScale`; this builder has no field tuning of its own to hand it. */
const ARM_WIDTH_TUNING = { armWidthScale: 1 } as GalaxyFieldTuning;

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** This arm's own age weight (0 = young gas arm, 1 = old stellar arm), floored so old arms stay faintly featured rather than bare. Shared by the lane ledger and every network class built on top of it. */
export function armAgeWeight(arm: GalaxyFieldArmRecord): number {
  return AGE_WEIGHT_FLOOR + AGE_WEIGHT_SPAN * (1 - arm.age);
}

/** The arm's true warped ridge point at a radius — mirrors `pushArmRidges`' own local `armCurvePos`. */
function ridgePointAtRadius(
  radius: number,
  geometry: GalaxyFieldGeometry,
  arm: GalaxyFieldArmRecord,
): Vec3 {
  return armRidgeCurvePoint(Math.log(radius / geometry.armStartRadius), geometry, arm);
}

export type ArmOffsetFrame = {
  readonly radius: number;
  /** This arm's ridge, offset onto the dust lane's own inner-edge track (the density-wave shock lane). */
  readonly point: Vec3;
  /** Local disc-plane normal. */
  readonly pole: Vec3;
  /** Unit tangent along the curve, increasing radius. */
  readonly along: Vec3;
  /** Unit vector across the curve, SIGNED toward the inner (shock) side — negate for the outward/inter-arm direction. */
  readonly across: Vec3;
};

/**
 * armOffsetFrameAt — the arm's warped ridge, offset onto the dust lane's own
 * inner-edge track, at one arbitrary log-radius. `buildArmOffsetCurve`
 * samples this at `STEPS_PER_ARM` points for the lane segments below; the
 * spur/bubble/bead classes in `dustNetworkFeatures.ts` call it directly at
 * their own placement radii — "walk the SAME offset lane curve" is this
 * function, not a re-derivation of it.
 */
export function armOffsetFrameAt(
  logR: number,
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  arm: GalaxyFieldArmRecord,
): ArmOffsetFrame {
  const { armStartRadius } = geometry;
  const hLight = discLightScaleLength(geometry);
  const offsetMagnitude = OFFSET_FRACTION * hLight * dust.network.laneOffset;
  const radius = armStartRadius * Math.exp(logR);
  const angle = armRidgeAngle(logR, geometry, arm);
  const center = armRidgeCurvePoint(logR, geometry, arm);
  const ahead = ridgePointAtRadius(radius * 1.01, geometry, arm);
  const behind = ridgePointAtRadius(radius * 0.99, geometry, arm);
  const along = normalize3(sub3(ahead, behind));
  const pole = warpSurfaceFrame(radius, angle, geometry).pole;
  const rawAcross = normalize3(cross3(pole, along));
  // +across or -across: whichever REDUCES cylindrical radius x^2+z^2 is
  // the inner (shock) side, regardless of the arm's own winding sense.
  // The directional derivative of r^2 along `across` is
  // 2*dot(center.xz, across.xz); its sign alone decides which way is in.
  const sign = center[0] * rawAcross[0] + center[2] * rawAcross[2] > 0 ? -1 : 1;
  const across: Vec3 = [rawAcross[0] * sign, rawAcross[1] * sign, rawAcross[2] * sign];
  const point: Vec3 = [
    center[0] + across[0] * offsetMagnitude,
    center[1] + across[1] * offsetMagnitude,
    center[2] + across[2] * offsetMagnitude,
  ];
  return { radius, point, pole, along, across };
}

export type ArmLaneCurve = {
  readonly radii: readonly number[];
  readonly poles: readonly Vec3[];
  readonly offsetPoints: readonly Vec3[];
  readonly ageWeight: number;
};

/**
 * buildArmOffsetCurve — `armOffsetFrameAt`, densely sampled across one arm's
 * radial span. Offset points first, cut into segments between consecutive
 * points, so every segment's endpoints sit exactly on the offset curve
 * rather than being independently offset (which would misalign a segment's
 * own tangent from its true curve).
 */
export function buildArmOffsetCurve(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  arm: GalaxyFieldArmRecord,
): ArmLaneCurve | null {
  const { armStartRadius } = geometry;
  const rStart = armStartRadius * 1.05;
  const rEnd = arm.fadeRadius;
  if (rEnd <= rStart) return null;
  const logStart = Math.log(rStart / armStartRadius);
  const logEnd = Math.log(rEnd / armStartRadius);

  const radii: number[] = [];
  const poles: Vec3[] = [];
  const offsetPoints: Vec3[] = [];
  for (let k = 0; k < STEPS_PER_ARM; k++) {
    const logR = logStart + ((logEnd - logStart) * k) / (STEPS_PER_ARM - 1);
    const frame = armOffsetFrameAt(logR, geometry, dust, arm);
    radii.push(frame.radius);
    poles.push(frame.pole);
    offsetPoints.push(frame.point);
  }
  return { radii, poles, offsetPoints, ageWeight: armAgeWeight(arm) };
}

/**
 * armLaneWidthAndAmplitude — the lane's own across-sigma and peak tau at one
 * radius: the same ledger `buildDustLaneFeatures`'s per-segment loop applies
 * (arm-carried share of the global column — see `armCarriedFraction`'s
 * header). Exported so the spur/bubble/bead classes root their own
 * width/amplitude in the lane's own numbers instead of re-deriving them.
 * `fade` is the caller's own `armFadeEnvelope(radius, ...)` — passed in
 * rather than recomputed here, since bubbles/beads read it at a raw event
 * radius that doesn't necessarily sit on the sampled offset curve.
 */
export function armLaneWidthAndAmplitude(
  radius: number,
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  ageWeight: number,
  fade: number,
): { readonly width: number; readonly amplitude: number } {
  const armWidth = armCrossSigma(radius, geometry, ARM_WIDTH_TUNING);
  // width feeds two divisions below (the amplitude normalisation and the
  // shader's own across-profile) — a `laneWidth` slider dragged to 0 would
  // otherwise divide by zero instead of reading as "no lane".
  const width = LANE_WIDTH_FRACTION * armWidth * dust.network.laneWidth;
  if (width <= 0) return { width: 0, amplitude: 0 };

  // Ledger: lane at contrast `contrast` over an interarm occupying the REST
  // of this radius's circumference — see `galaxyDustMixture.ts`'s
  // `armCarriedDustFraction` for the same formula evaluated once,
  // radius-averaged, as the smooth field's debit. `w` here is the arm's own
  // physical footprint (unscaled by LANE_WIDTH_FRACTION — see that
  // constant's comment), evaluated at THIS radius rather than radius-averaged.
  const w = geometry.numArms * 2 * armWidth;
  const fArm = armCarriedFraction(dust.network.armContrast, w, 2 * Math.PI * radius);
  const laneColumn = dustFaceOnColumn(radius, geometry, dust);
  // Peak tau such that integrating the across-lane profile (~sqrt(2*PI)*
  // width, treating the super-Gaussian as Gaussian-ish for this eyeball
  // normalisation) recovers this radius's arm-carried share of the global
  // lane's column.
  const amplitude = ((fArm * laneColumn) / (TAU_ROOT * width)) * ageWeight * fade;
  return { width, amplitude };
}

export function buildDustLaneFeatures(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): readonly GalaxyDustFeature[] {
  if (dust.tau <= 0 || geometry.numArms <= 0) return [];

  const out: GalaxyDustFeature[] = [];

  geometry.arms.forEach((arm, armIndex) => {
    const curve = buildArmOffsetCurve(geometry, dust, arm);
    if (!curve) return;
    const { radii, poles, offsetPoints, ageWeight } = curve;

    // Arc length accumulates ACROSS segments so the shader's along-lane noise
    // reads one continuous chain per arm instead of restarting its phase at
    // every joint. Tapering is the other half of that fix: only the chain's
    // two free ends (first segment's start, last segment's end) taper to
    // zero — every interior joint butts its neighbour seamlessly (taperIn/
    // taperOut = 0), which is what stops the lane from reading as dashes.
    let arcLength = 0;
    for (let k = 0; k < STEPS_PER_ARM - 1; k++) {
      const p0 = offsetPoints[k]!;
      const p1 = offsetPoints[k + 1]!;
      const segLen = distance3(p0, p1);
      if (segLen <= 1e-9) continue;
      const sOffset = arcLength;
      arcLength += segLen;
      const radius = (radii[k]! + radii[k + 1]!) / 2;

      const fade = armFadeEnvelope(radius, geometry, arm);
      const { width, amplitude } = armLaneWidthAndAmplitude(
        radius,
        geometry,
        dust,
        ageWeight,
        fade,
      );
      if (width <= 0 || amplitude <= 0) continue;

      out.push({
        p0,
        p1,
        normal: poles[k]!,
        width,
        amplitude,
        edgeSharpness: EDGE_SHARPNESS,
        // Deterministic per-arm decorrelation: kept small so it stays exact
        // in the shader's f32 lattice hash (no benefit to spreading it over
        // the full seed range here).
        noiseSeed: (seed % 1000) + armIndex * 37,
        noiseAmp: dust.network.texture,
        noiseFreq: 1 / (NOISE_WAVELENGTH_FRACTION * segLen),
        kind: 0,
        sOffset,
        taperIn: k === 0 ? TAPER_FRACTION * segLen : 0,
        taperOut: k === STEPS_PER_ARM - 2 ? TAPER_FRACTION * segLen : 0,
      });
    }
  });

  return out.slice(0, DUST_LANE_FEATURE_CAP);
}
