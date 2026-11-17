/**
 * buildDigVeil — the diffuse ionized gas haze the arms and HII knots sit
 * inside: complex/children blobs, anchored to the shell tier's flux. CPU
 * reference for the GPU placement (`placeDigVeil.wesl`).
 */
import { armRidgeAngle } from '../../arms/utils/armRidgeAngle';
import { armAgeWeight } from '../../arms/utils/dustLaneFeatures';
import { buildIsmMapDustCdf } from '../../../../../utils/galaxy/buildIsmMapDustCdf';
import { inverseCovarianceFromFrame } from '../../mixture/utils/inverseCovarianceFromFrame';
import { memoizeLastByKeys } from '../../../../../utils/cache/memoizeLastByKeys';
import { pcToUnits } from '../../mixture/utils/pcToUnits';
import { sampleIsmMapDustCdf } from '../../dustCdf/utils/sampleIsmMapDustCdf';
import { warpHeight } from '../../mixture/utils/warpHeight';
import { warpSurfaceFrame } from '../../mixture/utils/warpSurfaceFrame';
import { gaussian } from '../../../../../utils/random/gaussian';
import { mulberry32 } from '../../../../../utils/random/mulberry32';
import type { GalaxyFieldComponent } from '../../mixture/@types/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import type { GalaxyIsmMap } from '../../../../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapDustCdf } from '../../../../../@types/galaxy/GalaxyIsmMapDustCdf';
import type { Vec3 } from '../../../../../@types/math/Vec3';
import { armFadeEnvelope } from '../../arms/utils/armFadeEnvelope';
import { armCrossSigma } from '../../arms/utils/armCrossSigma';
import { deriveComplexCount } from './deriveComplexCount';
import { DigSeedFrame } from '../@types/DigSeedFrame';
import { TAU_ROOT3 } from '../data/tauRoot3';
import { ISO_FRAME } from '../data/isoFrame';
import {
  DIG_COMPLEX_SPREAD_PC,
  DIG_COMPLEXES_PER_EVENT,
  DIG_FLUX_RATIO_MAX,
  DIG_MAX_COUNT,
  DIG_SCALE_HEIGHT_PC,
  DIG_SIGMA_MAX_PC,
  DIG_SIGMA_MIN_PC,
} from '../data/digVeilBudget';

/** Dedicated rng stream salt for the DIG veil draws — distinct from "SFMP"/"HII "/"DUST"/"ARMC". CPU-only: `placeDigVeil.wesl` uses its own slot-hash population tags instead (see that file's own header). */
const DIG_SALT = 0x44494720;

/** Children flatten relative to their complex's in-plane extent — same ratio `clusteredDiscPlacement.ts`'s (private) `CHILD_POLE_RATIO` uses. Mirrored (not exported) in `placeDigVeil.wesl` — GPU-side shaders never import a TS constant, see that file's own header. */
const DIG_CHILD_POLE_RATIO = 0.4;

/**
 * A DIG complex CDF-sampled from the map's own `activity` density
 * (`buildDigVeil`) — the one substrate every complex draws from. `armBias`
 * (see `buildArmProximityEnvelope`) reweights the CDF itself before this
 * ever runs, rather than forking a second arm-lane placement path, so a
 * caller doesn't need to know it exists.
 */
function placeDigMapComplex(
  rng: () => number,
  geometry: GalaxyDescription,
  cdf: GalaxyIsmMapDustCdf,
): DigSeedFrame {
  const { radius, angle } = sampleIsmMapDustCdf(cdf, rng);
  const point: Vec3 = [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
  const surf = warpSurfaceFrame(radius, angle, geometry);
  return { point, along: surf.along, across: surf.across, pole: surf.pole };
}

/**
 * Arm-proximity reweighting kernel for `armBias` — how close a (radius,
 * angle) point sits to any arm's ridge, age-weighted the same way
 * `armAgeWeight` weights which arm to draw from. Radius-keyed memo rather
 * than a caller-driven per-ring table: `buildIsmMapDustCdf`'s own loop is
 * ring-major (the same radius repeats `az` times before the next ring), so
 * caching on "radius changed since the last call" gets the
 * one-recompute-per-ring cost without this function needing to know a ring
 * loop drives it.
 *
 * Cross-arm distance is the small-angle arc length `radius * deltaAngle`
 * against `armCrossSigma`'s own Gaussian width (matches `pushArmRidges`'s
 * blob sigma in `galaxyFieldMixture.ts`) — a 2D approximation in the texel's
 * own (radius, angle) plane, not the 3D warped ridge `armRidgeCurvePoint`
 * traces, which this density-only reweighting doesn't need.
 */
function buildArmProximityEnvelope(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): (radius: number, angle: number) => number {
  const arms = geometry.arms;
  if (arms.length === 0) return () => 0;
  const ageWeights = arms.map((arm) => armAgeWeight(arm));
  const maxAgeWeight = Math.max(...ageWeights);

  let cachedRadius = NaN;
  let invSigma = 0;
  const ridgeAngles = new Array<number>(arms.length);
  const weights = new Array<number>(arms.length);

  function refresh(radius: number): void {
    cachedRadius = radius;
    const logR = Math.log(radius / geometry.armStartRadius);
    const sigma = armCrossSigma(radius, geometry, tuning);
    invSigma = sigma > 0 ? 1 / sigma : 0;
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i]!;
      ridgeAngles[i] = armRidgeAngle(logR, geometry, arm);
      weights[i] = (ageWeights[i]! / maxAgeWeight) * armFadeEnvelope(radius, geometry, arm);
    }
  }

  return (radius: number, angle: number): number => {
    if (radius !== cachedRadius) refresh(radius);
    if (invSigma <= 0) return 0;
    let acc = 0;
    for (let i = 0; i < arms.length; i++) {
      const w = weights[i]!;
      if (w <= 0) continue;
      const raw = angle - ridgeAngles[i]!;
      const wrapped = raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));
      const z = radius * wrapped * invSigma;
      acc += w * Math.exp(-0.5 * z * z);
    }
    return Math.min(1, acc);
  };
}

/**
 * `mix(1, envelope(radius, angle), armBias)` applied multiplicatively to a
 * tier's own channel density — 0 leaves `base` untouched (this is what keeps
 * `armBias` a pure reweighting rather than a second placement density), 1
 * replaces it with the arm-proximity weight outright. `armBias <= 0` skips
 * the envelope call entirely, so the off setting never pays for the `exp()`
 * this runs per texel at `armBias > 0`.
 */
function armBiasedDensity(
  base: number,
  armBias: number,
  envelope: (radius: number, angle: number) => number,
  radius: number,
  angle: number,
): number {
  if (armBias <= 0) return base;
  return base * (1 + armBias * (envelope(radius, angle) - 1));
}

/**
 * Blends a seed's in-plane scatter axes toward a fresh random direction —
 * `dig.coherence` 1 keeps them exactly as `placeDigMapComplex` returned
 * them, 0 rotates them to a uniformly random angle. The same in-plane 2D
 * rotation `clusteredDiscPlacement.ts`'s `rotateFrameToOrientation` applies
 * for ITS coherence blend (toward a map-MEASURED angle, not a random one) —
 * `pole` never moves there either. `rng` is drawn unconditionally so the
 * draw order never shifts with the coherence knob.
 */
function scatterAxesForCoherence(
  frame: DigSeedFrame,
  coherence: number,
  rng: () => number,
): { readonly along: Vec3; readonly across: Vec3 } {
  const theta = (1 - coherence) * (rng() * 2 * Math.PI - Math.PI);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    along: [
      frame.along[0] * cos + frame.across[0] * sin,
      frame.along[1] * cos + frame.across[1] * sin,
      frame.along[2] * cos + frame.across[2] * sin,
    ],
    across: [
      frame.across[0] * cos - frame.along[0] * sin,
      frame.across[1] * cos - frame.along[1] * sin,
      frame.across[2] * cos - frame.along[2] * sin,
    ],
  };
}

const digCdfMemo = memoizeLastByKeys<GalaxyIsmMapDustCdf>();

/**
 * buildDigVeil — the DIG tier's own complex/children placement (see
 * `GalaxyHiiDigTuning`): `dig.complexes` seeds CDF-sampled from the map's
 * `activity` channel (`armBias` reweights that SAME CDF toward the arm
 * envelope rather than forking a second placement path — see
 * `buildArmProximityEnvelope`), each scattering `dig.childrenPerComplex`
 * blobs area-preservingly along/across its local flow direction
 * (`dig.elongation`, `dig.coherence`) — mirrors `dustParticleCloud.ts`'s S3
 * aspect convention (`along = spread*sqrt(e)`, `across = spread/sqrt(e)`).
 *
 * Gated (and its rng stream only consulted) when `dig.fraction > 0`, a map
 * is handed in, and that map's `activity` CDF has nonzero mass. Total flux
 * is anchored to `shellFluxSum` (the shell tier's own flux, not
 * `totalFlux`), because the cluster share folded into `totalFlux` is
 * stellar continuum, not Hα — see that binding's own comment at the call
 * site.
 *
 * `dig.complexes` is a scaler on `recentEventCount`, not an absolute count
 * — `recentEventCount` (young + mid-age events, see
 * `resolveEventLifecyclePopulation`) can run into the hundreds on an active
 * fluid run, far more than a diffuse haze should ever resolve into discrete
 * complexes, so `DIG_COMPLEXES_PER_EVENT` scales it down to the tier's own
 * population before `deriveComplexCount`'s scaler/clamp — a starting point
 * for visual calibration, not a measurement.
 */
export function buildDigVeil(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  ismMap: GalaxyIsmMap | null,
  shellFluxSum: number,
  recentEventCount: number,
  seed: number,
): readonly GalaxyFieldComponent[] {
  // Stale-stored-tuning guard: a preset saved before this knob existed
  // carries an `hii` section with no `dig` object at all — missing means
  // DIG OFF, the same "undefined = pre-feature stored tuning" discipline
  // this tier's own `digBrightness ?? 1` guard uses just below.
  const dig = tuning.hii.dig;
  if (!dig || !ismMap) return [];
  const fraction = Math.min(0.999, Math.max(0, dig.fraction));
  // `?? 1`: stale-stored-tuning guard for this tier's own gain (board item
  // 19), same discipline `dig.texture` already carries below.
  const digBrightness = dig.brightness ?? 1;
  if (fraction <= 0 || digBrightness <= 0 || !(dig.elongation > 0)) return [];

  const armBias = Math.min(1, Math.max(0, dig.armBias));
  // Discriminant is (map, geometry [proxy for `arms`], `arms.widthScale`,
  // `armBias`) — everything else `buildArmProximityEnvelope`/`armBiasedDensity`
  // read is baked into one of those four. `envelope` only gets built on a
  // cache miss, so a `complexes`/`elongation`/`coherence`/`texture` drag
  // (this tier's actually-common sliders) skips both the envelope setup AND
  // the CDF's O(rings x az x arms) sweep.
  const cdf = digCdfMemo.get([ismMap, geometry, tuning.arms.widthScale, armBias], () => {
    const envelope = buildArmProximityEnvelope(geometry, tuning);
    return buildIsmMapDustCdf(ismMap, (texel, radius, angle) =>
      armBiasedDensity(texel.activity, armBias, envelope, radius, angle),
    );
  });
  if (!(cdf.total > 0)) return [];

  const digRatio = Math.min(DIG_FLUX_RATIO_MAX, fraction / (1 - fraction));
  // `shellFluxSum` already carries the root master (`tierFlux`'s own doc) —
  // `digBrightness` layers DIG's own gain on top without re-applying it.
  const digTotalFlux = digRatio * shellFluxSum * digBrightness;
  if (!(digTotalFlux > 0)) return [];

  const childrenPerComplex = Math.max(0, Math.round(dig.childrenPerComplex));
  if (childrenPerComplex <= 0 || dig.complexes <= 0) return [];
  // Complex count clamped to DIG_MAX_COUNT's own budget rather than
  // truncating a partial trailing complex: fewer, smaller complexes read as
  // a thinner veil, not a veil with one oddly-stunted complex.
  const complexes = deriveComplexCount(
    recentEventCount * DIG_COMPLEXES_PER_EVENT,
    dig.complexes,
    childrenPerComplex,
    DIG_MAX_COUNT,
  );
  if (complexes <= 0) return [];
  const totalChildren = complexes * childrenPerComplex;

  const elongation = dig.elongation;
  const coherence = Math.min(1, Math.max(0, dig.coherence));
  const complexSpread = pcToUnits(DIG_COMPLEX_SPREAD_PC);

  const rng = mulberry32(seed ^ DIG_SALT);
  const digAmplitudeBase = digTotalFlux / totalChildren;
  const digColor = geometry.hiiPalette.halo;
  // Stale-stored-tuning guard, same discipline `dig.armBias` et al. already
  // get from this function's own `!dig` early-return — a preset saved before
  // this knob existed carries a `dig` object with no `texture` key.
  const digTextureWeight = dig.texture ?? 0;

  const out: GalaxyFieldComponent[] = [];
  for (let c = 0; c < complexes; c++) {
    const seedFrame = placeDigMapComplex(rng, geometry, cdf);
    const axes = scatterAxesForCoherence(seedFrame, coherence, rng);

    for (let ch = 0; ch < childrenPerComplex; ch++) {
      const offAlong = gaussian(rng) * complexSpread * Math.sqrt(elongation);
      const offAcross = (gaussian(rng) * complexSpread) / Math.sqrt(elongation);
      const offPole = gaussian(rng) * complexSpread * DIG_CHILD_POLE_RATIO;
      const x =
        seedFrame.point[0] +
        axes.along[0] * offAlong +
        axes.across[0] * offAcross +
        seedFrame.pole[0] * offPole;
      const z =
        seedFrame.point[2] +
        axes.along[2] * offAlong +
        axes.across[2] * offAcross +
        seedFrame.pole[2] * offPole;
      const yFlat =
        seedFrame.point[1] +
        axes.along[1] * offAlong +
        axes.across[1] * offAcross +
        seedFrame.pole[1] * offPole;
      // Warp lift at THIS CHILD's own (x, z) — `seedFrame.point` sits at the
      // flat reference height, never lifted (`placeDigMapComplex`'s own doc).
      const y = yFlat + warpHeight(Math.hypot(x, z), Math.atan2(z, x), geometry);
      // Extraplanar scatter on top of the in-plane placement above — DIG
      // stands thicker off the disc than a single HII shell (Haffner+2009).
      const height = y + gaussian(rng) * pcToUnits(DIG_SCALE_HEIGHT_PC);
      const sigma = pcToUnits(DIG_SIGMA_MIN_PC + (DIG_SIGMA_MAX_PC - DIG_SIGMA_MIN_PC) * rng());
      out.push({
        amplitude: digAmplitudeBase / (TAU_ROOT3 * sigma * sigma * sigma),
        ...inverseCovarianceFromFrame(ISO_FRAME, { along: sigma, across: sigma, pole: sigma }),
        color: digColor,
        center: [x, height, z],
        boundRadius: sigma,
        textureWeight: digTextureWeight,
      });
    }
  }
  return out;
}
