/**
 * Math-derivation exception (comments.md): the arm-ridge curve/width/
 * envelope/colour vocabulary — shared truth for "where the ridge is" and
 * "how it looks" that the ridge chain (`galaxyFieldMixture.ts`), the arm
 * particle cloud (`armParticleCloud.ts`) and the dust lane code all place
 * themselves against. Lives in its own module, not `galaxyFieldMixture.ts`,
 * because `armParticleCloud.ts` needs it too and `galaxyFieldMixture.ts`
 * imports `armParticleCloud.ts` — hosting it there would cycle.
 */
import { cross3 } from '../../../../utils/math/cross3';
import { lerpVec3 } from '../../../../utils/math/lerpVec3';
import { normalize3 } from '../../../../utils/math/normalize3';
import { warpHeight } from '../../../../utils/galaxy/warpHeight';
import { warpSurfaceFrame } from '../../../../utils/galaxy/warpSurfaceFrame';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../../../@types/math/Vec3';

/** Hot blue-white, nudged bluer with youngFraction — eyeball, echoing tempColorRamp(0.6 + 0.36*youngFraction)'s direction without matching its curve. */
const ARM_COLOR_OLD: Readonly<Vec3> = [0.8, 0.86, 1.0];
const ARM_COLOR_YOUNG: Readonly<Vec3> = [0.65, 0.78, 1.0];

/**
 * Arms sit inside the disc, so their populations skew with radius the same
 * way the disc's do (inside-out formation — see `galaxyFieldMixture.ts`'s
 * DISC_COLOR_INNER/OUTER). A second, independent cross-fade on top of the
 * age one above, kept a minority share (`ARM_RADIAL_STRENGTH`) so
 * `youngFraction` stays the dominant signal.
 */
const ARM_RADIAL_INNER: Readonly<Vec3> = [0.9, 0.85, 0.68];
const ARM_RADIAL_OUTER: Readonly<Vec3> = [0.6, 0.75, 1.0];
const ARM_RADIAL_STRENGTH = 0.4;

/** Exported so `armParticleCloud.ts`'s sprites match the ridge chain's own colour exactly, rather than re-deriving it. */
export function armColor(youngFraction: number, radialT: number): Vec3 {
  const age = Math.min(1, Math.max(0, youngFraction));
  const ageColor = lerpVec3(ARM_COLOR_OLD, ARM_COLOR_YOUNG, age);
  const radial = Math.min(1, Math.max(0, radialT));
  const radialColor = lerpVec3(ARM_RADIAL_INNER, ARM_RADIAL_OUTER, radial);
  return lerpVec3(ageColor, radialColor, ARM_RADIAL_STRENGTH);
}

function smoothstep01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Ridge angle: log-spiral phase + meander + (gated) high-frequency wave — shared by `sfEventCatalog.ts` and the dust lane rather than re-derived. */
export function armRidgeAngle(
  logR: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): number {
  const angle =
    arm.phase +
    arm.pitch * logR +
    arm.meanderAmp * Math.sin(arm.meanderFreq * logR * 2 + arm.meanderPhase);
  // waveAmount is 0 for most presets, so no separate gate is needed here,
  // unlike the WGSL source's `if` (which skips four sin() calls per star).
  return (
    angle +
    geometry.waveAmount *
      (Math.sin(arm.waveF1 * logR + arm.waveP1) * 0.16 +
        Math.sin(arm.waveF2 * logR + arm.waveP2) * 0.09)
  );
}

/**
 * Ridge position at a given log-radius — armStarSample's `x`/`y`/`z` before
 * scatter, the exact curve blobs are placed on. Shared by the dense
 * curvature sample (`deriveArmBlobCount`) and the actual placement below so
 * both agree on what "the ridge" is by construction, not by staying in sync.
 */
export function armRidgeCurvePoint(
  logR: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): Vec3 {
  const radius = geometry.armStartRadius * Math.exp(logR);
  const angle = armRidgeAngle(logR, geometry, arm);
  return [radius * Math.cos(angle), warpHeight(radius, angle, geometry), radius * Math.sin(angle)];
}

/** The arm's true warped centre at a given radius — see `armRidgeCurvePoint`. */
function armCurvePos(radius: number, geometry: GalaxyDescription, arm: GalaxyFieldArmRecord): Vec3 {
  return armRidgeCurvePoint(Math.log(radius / geometry.armStartRadius), geometry, arm);
}

export type ArmRidgeFrame = { readonly point: Vec3 } & {
  readonly along: Vec3;
  readonly across: Vec3;
  readonly pole: Vec3;
};

/**
 * The ridge's own orthonormal frame at a log-radius — `point` is
 * `armRidgeCurvePoint`, `along` its tangent (central difference), `across`/
 * `pole` the surface-tangent pair Gram-Schmidt'd off it. Shared by
 * `pushArmRidges`' per-blob placement and `armParticleCloud.ts`'s lane-frame
 * provider, so both agree on what "the ridge" is by construction.
 */
export function armRidgeFrameAt(
  logR: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): ArmRidgeFrame {
  const radius = geometry.armStartRadius * Math.exp(logR);
  const angle = armRidgeAngle(logR, geometry, arm);
  const point = armRidgeCurvePoint(logR, geometry, arm);
  const ahead = armCurvePos(radius * 1.01, geometry, arm);
  const behind = armCurvePos(radius * 0.99, geometry, arm);
  const along = normalize3([ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]]);
  const surfacePole = warpSurfaceFrame(radius, angle, geometry).pole;
  const across = normalize3(cross3(surfacePole, along));
  const pole = cross3(along, across); // re-orthonormalise: surfacePole need not be perpendicular to `along`
  return { point, along, across, pole };
}

/**
 * Where an ordinary arm starts placing, as a fraction of `armStartRadius` —
 * `describeGalaxy` stores `log` of this as every non-spur arm's own
 * `GalaxyFieldArmRecord.spanStartLogR` (a spur's is its own root, further
 * out — `armSpurGeometry.ts`). This constant's one remaining direct
 * consumer is `clusteredDiscPlacement.ts`'s arm-lane seeding, which only
 * ever runs over `geometry.arms`, never spurs.
 */
export const ARM_SPAN_START_FRAC = 1.05;

/**
 * Where the outer taper begins, as a fraction of this arm's own `fadeRadius`
 * — the taper spans the outer 40% of the arm, comparable to the brightness
 * law it multiplies rather than swamping it.
 *
 * NOT `armFullRadius` (0.42 * fadeRadius, `describeGalaxy.ts`), which
 * `generate.wesl`'s sprite copy of this envelope still uses: at 0.42 the
 * smoothstep is a second radial brightness law on top of
 * `armExcessSurfaceShape`, one no knob can reach past — it alone cost the
 * Milky Way preset's arms a factor ~2 by the disc edge and drove them to
 * zero half a disc radius before the disc's own light ran out.
 */
const ARM_TAPER_START_FRAC = 0.6;

/** The analytic arms' radial extent: an inner ramp, and an outer taper to zero at this arm's own `fadeRadius`. Brightness along that extent is `armExcessSurfaceShape`'s job, not this one's — see `ARM_TAPER_START_FRAC`. */
export function armFadeEnvelope(
  radius: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): number {
  const innerT = (radius - geometry.armStartRadius) / geometry.armInnerRampW;
  const taperStart = arm.fadeRadius * ARM_TAPER_START_FRAC;
  const outerT = (radius - taperStart) / Math.max(0.001, arm.fadeRadius - taperStart);
  return smoothstep01(innerT) * (1 - smoothstep01(outerT));
}

/**
 * Reid et al. 2019's maser-arm width law, re-expressed in units of the disc
 * scale length (h = 2.605 kpc for the MW) so it scales to any galaxy: w/h =
 * FLOOR_H + SLOPE*(R/h), i.e. w = FLOOR_H*h + SLOPE*R.
 */
const ARM_WIDTH_FLOOR_H = 0.017;
const ARM_WIDTH_SLOPE = 0.036;

/**
 * The arm excess's radial surface-brightness shape, exp(-(R - R_full) /
 * (hLight * scaleRatio)), normalised to 1 at `armFullRadius`. Read by both
 * arm tiers (`pushArmRidges` and `armParticleCloud.ts`), leaving
 * `GalaxyArmCloudTuning.share` a grain knob on the residual. What
 * `scaleRatio` means physically: `GalaxyArmTuning.excessScaleRatio`.
 */
export function armExcessSurfaceShape(
  radius: number,
  geometry: GalaxyDescription,
  hLight: number,
  scaleRatio: number,
): number {
  return Math.exp(-(radius - geometry.armFullRadius) / (hLight * Math.max(scaleRatio, 1e-3)));
}

/** This arm's cross-section sigma at a radius — same formula the blob placement's `sigmas.across` uses. */
export function armCrossSigma(
  radius: number,
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  return (
    (ARM_WIDTH_FLOOR_H * geometry.diskScaleLen + ARM_WIDTH_SLOPE * radius) * tuning.arms.widthScale
  );
}
