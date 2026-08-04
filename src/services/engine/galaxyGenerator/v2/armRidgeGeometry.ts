/**
 * The arm-ridge curve/width/envelope/colour vocabulary: shared truth for
 * "where the ridge is" and "how it looks" that the ridge chain
 * (`galaxyFieldMixture.ts`), the arm particle cloud (`armParticleCloud.ts`)
 * and the dust lane code all place themselves against. It used to live in
 * `galaxyFieldMixture.ts`, with `armParticleCloud.ts` importing from it and
 * it importing back — a real cycle. Extracted here so neither side owns the
 * other.
 */
import { warpHeight } from '../../../../utils/galaxy/warpHeight';
import { warpSurfaceFrame } from '../../../../utils/galaxy/warpSurfaceFrame';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../../../@types/math/Vec3';

/** Hot blue-white, nudged bluer with youngFraction — eyeball, echoing tempColorRamp(0.6 + 0.36*youngFraction)'s direction without matching its curve. */
const ARM_COLOR_OLD: Readonly<Vec3> = [0.8, 0.86, 1.0];
const ARM_COLOR_YOUNG: Readonly<Vec3> = [0.65, 0.78, 1.0];

/** Exported so `armParticleCloud.ts`'s sprites match the ridge chain's own colour exactly, rather than re-deriving it. */
export function armColor(youngFraction: number): Vec3 {
  const t = Math.min(1, Math.max(0, youngFraction));
  return [
    ARM_COLOR_OLD[0] + (ARM_COLOR_YOUNG[0] - ARM_COLOR_OLD[0]) * t,
    ARM_COLOR_OLD[1] + (ARM_COLOR_YOUNG[1] - ARM_COLOR_OLD[1]) * t,
    ARM_COLOR_OLD[2] + (ARM_COLOR_YOUNG[2] - ARM_COLOR_OLD[2]) * t,
  ];
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Exported so `galaxyFieldMixture.ts`'s `deriveArmBlobCount` can share it rather than restate it. */
export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function smoothstep01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Exported so the SF-event catalog (`sfEventCatalog.ts`) and the dust lane
// share the same ridge truth by import, not by re-deriving the curve.
/** armStarSample's ridge angle: log-spiral phase + meander + (gated) high-frequency wave. */
export function armRidgeAngle(
  logR: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): number {
  const angle =
    arm.phase +
    arm.pitch * logR +
    arm.meanderAmp * Math.sin(arm.meanderFreq * logR * 2 + arm.meanderPhase);
  // waveAmount is 0 for most presets, in which case this term is 0 too — no
  // separate gate needed, unlike the WGSL source's `if` (a branch that only
  // exists there to skip four sin() calls per star).
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
function armCurvePos(
  radius: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): Vec3 {
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
 * `pushArmRidges`' own per-blob placement and `armParticleCloud.ts`'s
 * lane-frame provider, so both agree on what "the ridge" is by construction
 * rather than by staying in sync across two copies.
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
 * Where every arm tier starts placing, as a fraction of `armStartRadius` —
 * the ridge chain, the sprite cloud, the SF-event catalog and the lane
 * sampler share it so their arms begin together rather than at four
 * independently-drifting radii. Unrelated to the outer margins below, which
 * are fractions of `fadeRadius`.
 */
export const ARM_SPAN_START_FRAC = 1.05;

/**
 * Where the outer taper begins, as a fraction of this arm's own `fadeRadius`.
 * The taper spans the outer 40% of the arm: 2.0 of the arm excess's own
 * scale lengths on the Milky Way preset, 1.2 on every gallery one (the MW
 * is the only preset overriding `diskScaleLenFrac`, which is the whole
 * difference) — comparable to the brightness law it multiplies rather than
 * swamping it.
 *
 * NOT `armFullRadius` (0.42 * fadeRadius), which `generate.wesl`'s sprite copy
 * of this envelope still uses: at 0.42 the smoothstep is a SECOND radial
 * brightness law on top of `armExcessSurfaceShape`, and one no knob can reach
 * past — it alone cost the Milky Way preset's arms a factor ~2 by the disc
 * edge and drove them to exactly zero half a disc radius later, so the arms
 * died while the disc's own light ran on to ~1.3 * outerRadius.
 */
const ARM_TAPER_START_FRAC = 0.6;

/**
 * The analytic arms' radial extent: `armStarSample`'s inner ramp, and an
 * outer taper to zero at this arm's own fadeRadius (rec0.w). The arm's
 * BRIGHTNESS along that extent is `armExcessSurfaceShape`'s job, not this
 * one's — see ARM_TAPER_START_FRAC.
 */
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
 * Reid et al. 2019's measured Milky Way maser-arm width law, w(R) = 336 pc +
 * 36 pc/kpc x (R - 8.15 kpc), re-expressed in units of the disc scale length
 * (h = 2.605 kpc for the MW) so it scales to any galaxy: w/h = FLOOR_H +
 * SLOPE*(R/h), i.e. w = FLOOR_H*h + SLOPE*R. This is the width of the YOUNG
 * maser arm — a verified floor for old-star arms, with `tuning.armWidthScale`
 * carrying any old-population broadening (1 = the measured law exactly).
 */
const ARM_WIDTH_FLOOR_H = 0.017;
const ARM_WIDTH_SLOPE = 0.036;

/**
 * The arm excess's own radial surface-brightness shape, exp(-(R - R_full) /
 * (hLight * scaleRatio)), normalised to 1 at `armFullRadius`. That pivot is
 * inside every arm's taper start, so turning the knob brightens the outer arm
 * instead of rescaling the whole arm system against the disc it is measured
 * out of — moving it outward would divide the excess by the disc's own
 * exp(-R/h) at the new pivot and dim every arm.
 *
 * `scaleRatio` is the arm excess's exponential scale length in units of the
 * DISC's, and is the one place the two arm tiers' radial profiles are
 * decided. At 1 the excess tracks the disc exactly, which is the same thing
 * as holding the arm/interarm contrast K constant with radius. Above 1 the
 * excess falls off more slowly than the disc, i.e. K GROWS outward.
 *
 * Growth is the observed direction: arm/interarm contrast rising with radius
 * is a common result in resolved spiral photometry, and the mechanism is not
 * subtle — the arms are traced by gas and young stars, whose discs are
 * measurably more extended than the old stellar disc (UV and HI discs
 * routinely outrun the optical one). The specific ratio here is NOT measured
 * and is a look knob; only its direction is defended.
 *
 * Shared by both arm tiers (`pushArmRidges` and `armParticleCloud.ts`) so
 * that `armCloudShare` redistributes GRAIN at a fixed radial profile. It used
 * to redistribute the profile too — the ridge carried this exponential and
 * the cloud carried none, so the same excess was shaped two different ways
 * and the share slider slid the arms' light outward as a side effect.
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
    (ARM_WIDTH_FLOOR_H * geometry.diskScaleLen + ARM_WIDTH_SLOPE * radius) * tuning.armWidthScale
  );
}
