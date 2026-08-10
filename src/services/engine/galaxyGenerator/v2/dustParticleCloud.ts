/**
 * Math-derivation exception (comments.md): the galaxy's only dust tier —
 * small anisotropic 3D Gaussians standing in for GMC/cloud complexes,
 * splatted through `dustMap.wesl`, carrying the galaxy's full `dust.tau`.
 * Anchored on Larson's third law (mass ~ R^2 at ~constant surface density),
 * the R^-2.2 GMC size function (Watkins+2023), and ISM hierarchical
 * clustering (two-level complex/children, the ISM map when usable else a
 * smooth disc). No cavity carving: HII regions can sit inside uncarved dust
 * until the fluid generator's gas depletion is tuned to carve on its own.
 */
import {
  buildClusteredDiscPlacement,
  type CloudFrame,
  type ClusteredDiscPlacementMode,
  type OrientationDeltaStats,
} from './clusteredDiscPlacement';
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { dustDiscShape, dustSigmaR } from './galaxyDustMixture';
import { buildIsmMapDustCdf } from '../../../../utils/galaxy/buildIsmMapDustCdf';
import type { IsmMapDensityTexel } from '../../../../utils/galaxy/buildIsmMapDustCdf';
import { dustExtinctionRgb } from '../../../../utils/galaxy/dustExtinctionRgb';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { pcToUnits } from '../../../../utils/galaxy/pcToUnits';
import { stretchExtinctionChroma } from '../../../../utils/galaxy/stretchExtinctionChroma';
import { sampleGalaxyIsmMap } from '../../../../utils/galaxy/sampleGalaxyIsmMap';
import { sampleIsmMapDustCdf } from '../../../../utils/galaxy/sampleIsmMapDustCdf';
import { sampleIsmMapOrientation } from '../../../../utils/galaxy/sampleIsmMapOrientation';
import { ismMapRingIndexForRadius } from '../../../../utils/galaxy/ismMapRingIndexForRadius';
import { ismMapRingMeans } from '../../../../utils/galaxy/ismMapRingMeans';
import { arrayMean } from '../../../../utils/math/arrayMean';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyDustParams } from '../../../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { GalaxyIsmMap } from '../../../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapOrientation } from '../../../../@types/galaxy/GalaxyIsmMapOrientation';
import type { Vec3 } from '../../../../@types/math/Vec3';

const MAX_PARTICLE_COUNT = 40000;

/**
 * GMC size function dN/dR ~ R^-2.2, over the measured 15-200 pc span —
 * absolute parsecs, not a fraction of the disc, since cloud sizes are set
 * by the ISM's own near-universal Jeans/turbulence physics.
 *
 * These bound the tier's contrast: per-cloud peak tau = dust.tau / f, with
 * covering factor f = N * 2*PI * elongation * <R^2> / A_disc. Oversized
 * clouds drive f into the tens and the tier reads as a smooth haze; f
 * around 2-3 is the target.
 *
 * `SIZE_MIN_PC` doubles as `sizeFloorPc`'s slider default and lower clamp —
 * raising the floor at fixed `count` raises mean R^2, hence f, which makes
 * every cloud fainter (mass renormalises to the tier's total via
 * `massPerR2 = totalMass / sumR2`).
 */
export const SIZE_MIN_PC = 15;
const SIZE_MAX_PC = 200;
const GMC_SIZE_POWER = 2.2;

/**
 * Base world span of one full wrap of the baked ridged-noise volume
 * (dustNoiseBake.wesl), parsecs, before `textureScale`. Its four octave
 * bands sit at 500/250/125/62 pc — straddling the 15-200 pc measured
 * cloud-size span above, so the erosion bites at the same scale the clouds
 * themselves live at.
 */
export const DUST_NOISE_TILE_PC = 500;

/** World-unit tile size at a given `textureScale` — the one place `pcToUnits` combines with `DUST_NOISE_TILE_PC`, so `createGalaxyEngine.ts` doesn't restate the conversion. */
export function dustNoiseTileUnits(textureScale: number): number {
  return pcToUnits(DUST_NOISE_TILE_PC) * textureScale;
}

/**
 * GMC associations run 300-800 pc; this is the child scatter's one-sigma,
 * before elongation. Not scaled by `sizeScale`, unlike the size draw below:
 * that knob's contract is the cloud size range, and a scatter tracking it
 * would translate every particle away from its complex's seed point rather
 * than growing each cloud in place.
 */
const COMPLEX_SPREAD_PC = 250;

/** Clouds are flattened relative to their in-plane extent. */
const CLOUD_POLE_RATIO = 0.6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

/**
 * Survival floor, keyed on the same channel placement draws from (the map's
 * raw `dust` channel): a map-seeded particle whose texel sits below this is
 * dropped after placement — a post-filter that never touches the CDF
 * sampler's own rng stream, needed because cluster children scatter
 * `COMPLEX_SPREAD_PC` around their complex's seed and can straddle into a
 * true cavity the placement draw itself would never pick.
 *
 * A fraction of the sampled texel's own ring mean, not the map's global
 * mean: a cavity is low relative to its ring, not the whole disc — the
 * outer disc's honest faintness must not mass-cull splats the radial
 * envelope legitimately placed there. An absolute constant doesn't work
 * either, since the ambient pedestal varies by radius and simulation time.
 *
 * Exported: the "seeding" debug view in `ismMapPresent.wesl` mirrors this
 * fraction (parity-tested in `constants.parity.test.ts`).
 */
export const DUST_SURVIVAL_FLOOR_FRAC = 0.01;

/** Below this global mean (mean of every ring's own mean), the map is transport-off/early-run noise — too close to zero to divide by. Below the floor, placement falls back to `smoothDisc`, the same path an absent map takes. */
const GLOBAL_MEAN_EPS = 1e-6;

type CloudParticle = {
  readonly center: Vec3;
  readonly frame: CloudFrame;
  readonly radius: number;
  /** sigma_along / sigma_across — `cloud.elongation` off the map path; coherence-scaled toward it on the map path (S3). */
  readonly aspect: number;
  /** Always true off the map path; on it, false below `DUST_SURVIVAL_FLOOR_FRAC * ringMean[ring]` (S3). */
  readonly alive: boolean;
};

export function buildDustParticleCloud(
  geometry: GalaxyDescription,
  dust: GalaxyDustParams,
  tuning: GalaxyFieldTuning,
  seed: number,
  ismMap: GalaxyIsmMap | null,
  ismMapOrientation: GalaxyIsmMapOrientation | null,
  orientationDeltaStats?: OrientationDeltaStats,
): readonly GalaxyFieldComponent[] {
  const { cloud } = dust;
  if (geometry.light.disc <= 0 || dust.tau <= 0 || cloud.count <= 0) {
    return [];
  }
  const count = Math.min(cloud.count, MAX_PARTICLE_COUNT);

  // Clamped below at SIZE_MIN_PC: under the measured span is unphysical AND
  // makes the speckle this knob exists to fix worse, not better.
  const floorPc = Math.min(Math.max(cloud.sizeFloorPc, SIZE_MIN_PC), SIZE_MAX_PC * 0.9);
  const sizeMin = pcToUnits(floorPc) * cloud.sizeScale;
  const sizeMax = pcToUnits(SIZE_MAX_PC) * cloud.sizeScale;
  if (!(sizeMin > 0) || !(sizeMax > sizeMin)) return [];

  // Inverse-CDF of dN/dR ~ R^-a over [sizeMin, sizeMax].
  const sizeExp = 1 - GMC_SIZE_POWER;
  const sizeMinPow = sizeMin ** sizeExp;
  const sizeMaxPow = sizeMax ** sizeExp;
  const sampleRadius = (u: number): number =>
    (u * (sizeMaxPow - sizeMinPow) + sizeMinPow) ** (1 / sizeExp);
  const complexSpread = pcToUnits(COMPLEX_SPREAD_PC);

  const shape = dustDiscShape(geometry, dust);
  // `?? 1`: a preset saved before `redness` existed loads `undefined` here.
  const extinctionRgb = stretchExtinctionChroma(dustExtinctionRgb(dust.rV), dust.redness ?? 1);
  const sigmaZCloud = shape.sigmaZ * cloud.heightRatio;

  const rng = mulberry32(seed ^ 0x44555354); // "DUST"

  // The map IS the placement density (its raw `dust` channel) when the
  // generator is running: every complex placed by `'mapDensity'` mode, its
  // centre drawn from the inverse-CDF sampler (`buildIsmMapDustCdf`).
  // Otherwise (`generator === 'none'` or a quiet map): `'smoothDisc'` mode,
  // no arm-lane concept — that machinery stays with `armParticleCloud.ts`.
  //
  // Raw dust, not overshoot-above-ambient: the ambient pedestal is seeded
  // `ambient * gasProfile(r)` and advected by the fluid generator — it IS
  // structure, and subtracting it would erase the faint wisps this
  // placement seeds clouds into.
  //
  // Ring-normalised, not a single map-wide mean: a map-wide mean is flat
  // enough that capping a hot texel also flattens the radial profile itself
  // — a runaway inner-disc rim would thin toward parity with the (honestly
  // faint) outer disc, which has far more texel count/area to win that
  // fight. Density factors into an envelope term (ringMean[ring] /
  // globalMean, untouched by the cap) times a within-ring term
  // (dust / ringMean[ring], capped): the envelope preserves the map's
  // measured radial profile exactly at every cap setting, while the cap
  // only redistributes mass azimuthally within a ring. `globalMean =
  // arrayMean(ringMeans)`: the seeding debug view in `ismMapPresent.wesl`
  // uses the same definition, uploaded as the same number, so the two
  // cannot drift apart.
  let placement: ClusteredDiscPlacementMode = { kind: 'smoothDisc' };
  // S3's per-particle aspect/survival, non-null only on the map-seeded path —
  // `null` keeps `drawPayload` below byte-identical to the pre-S3 smoothDisc
  // behaviour, same gating shape as `ismMapOrientation` just below.
  let sampleMapTraits:
    | ((radius: number, angle: number) => { aspect: number; alive: boolean })
    | null = null;
  if (tuning.ismMap.generator !== 'none' && ismMap) {
    const map = ismMap; // narrowed alias so the closures below don't re-null-check
    const ringMeans = ismMapRingMeans(map, (texel) => texel.dust);
    const globalMean = arrayMean(ringMeans);
    // Guard: a map with no dust anywhere (transport off, or the generator
    // hasn't run long enough yet) leaves `placement` at its `smoothDisc`
    // default instead of dividing by ~0 — the SAME fallback an absent map
    // takes, not a crash.
    if (globalMean >= GLOBAL_MEAN_EPS) {
      // `?? 0`: `migrateGalaxyFieldTuningWire`'s defaults-fill is shallow —
      // it fills holes in `dust` itself, but `cloud` is taken wholesale, so
      // a preset saved before this field existed still loads `undefined`
      // here; treat that as "uncapped" (cap 0), not NaN.
      const cap = cloud.dustPlacementCap ?? 0;
      // Cached across the `az` calls `buildIsmMapDustCdf`'s loop makes at a
      // fixed `radius`: this callback runs per texel over the whole
      // 1536x512 grid on every slider change, and the ring lookup is a
      // log/round pair not worth repeating `az` times for the same answer.
      let lastRadius = NaN;
      let lastRing = 0;
      const density = (texel: IsmMapDensityTexel, radius: number): number => {
        if (radius !== lastRadius) {
          lastRadius = radius;
          lastRing = ismMapRingIndexForRadius(radius, map.rings, map.rMin, map.rMax);
        }
        const ringMean = ringMeans[lastRing]!;
        if (texel.dust <= 0 || ringMean <= 0) return 0;
        const local = texel.dust / ringMean;
        const capped = cap > 0 ? Math.min(local, cap) : local;
        return (ringMean / globalMean) * capped;
      };
      const cdf = buildIsmMapDustCdf(map, density);
      if (cdf.total > 0) {
        placement = {
          kind: 'mapDensity',
          samplePoint: (mapRng) => sampleIsmMapDustCdf(cdf, mapRng),
        };
        sampleMapTraits = (radius, angle) => {
          const coherence = ismMapOrientation
            ? sampleIsmMapOrientation(ismMapOrientation, radius, angle).coherence
            : 0;
          const sample = sampleGalaxyIsmMap(map, radius, angle);
          const ring = ismMapRingIndexForRadius(radius, map.rings, map.rMin, map.rMax);
          return {
            aspect: 1 + (cloud.elongation - 1) * coherence,
            alive: sample.dust >= DUST_SURVIVAL_FLOOR_FRAC * ringMeans[ring]!,
          };
        };
      }
    }
  }

  const rawParticles: CloudParticle[] = buildClusteredDiscPlacement<{
    radius: number;
    aspect: number;
    alive: boolean;
  }>(
    {
      geometry,
      rng,
      count,
      clumpiness: cloud.clumpiness,
      complexSpread,
      elongation: cloud.elongation,
      sigmaZComplex: sigmaZCloud,
      discSigmaR: (k) => dustSigmaR(k, shape),
      discWeights: DISC_SURFACE_WEIGHTS,
      discWeightSum: shape.sumW,
      placement,
      // Gated with `placement` above: `generator === 'none'` is a no-op, so a
      // caller with the map already sampled needn't re-check it.
      ismMapOrientation: tuning.ismMap.generator !== 'none' ? ismMapOrientation : null,
      orientationDeltaStats,
    },
    (childRng, center) => {
      const radius = sampleRadius(childRng());
      if (!sampleMapTraits) return { radius, aspect: cloud.elongation, alive: true };
      // Deterministic lookup, no rng draw — S3's survival filter runs AFTER
      // placement (below), so this never disturbs the CDF sampler's stream.
      const traits = sampleMapTraits(
        Math.hypot(center[0], center[2]),
        Math.atan2(center[2], center[0]),
      );
      return { radius, ...traits };
    },
  );
  // S3 cavity filter — a post-filter (see `DUST_SURVIVAL_FLOOR_FRAC`), a
  // no-op off the map path since `alive` is always true there.
  const particles = rawParticles.filter((p) => p.alive);

  // Larson's third law — mass ~ R^2 (constant cloud surface density).
  let weightedSigma2 = 0;
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    weightedSigma2 += (DISC_SURFACE_WEIGHTS[i]! / shape.sumW) * dustSigmaR(i, shape) ** 2;
  }
  // dust.tau in full: this tier carries the galaxy's entire measured column (galaxyDustMixture.ts has no GPU mixture of its own to debit a share against).
  const totalMass = dust.tau * 2 * Math.PI * weightedSigma2;
  // Summed AFTER the S3 filter above, so a cavity-dropped particle's R^2
  // share is redistributed onto the survivors and `dust.tau` stays exact.
  let sumR2 = 0;
  for (const p of particles) sumR2 += p.radius * p.radius;
  if (!(totalMass > 0) || !(sumR2 > 0)) return [];
  const massPerR2 = totalMass / sumR2;

  return particles.map((p) => {
    // Map path: area-preserving aspect (along x across = R^2 always) so the
    // Larson mass ~ R^2 renormalisation above stays exact per particle, not
    // just in aggregate (see docs/research/m74-jwst/07-sprite-seeding.md).
    const sigmas =
      placement.kind === 'mapDensity'
        ? {
            along: p.radius * Math.sqrt(p.aspect),
            across: p.radius / Math.sqrt(p.aspect),
            pole: p.radius * CLOUD_POLE_RATIO,
          }
        : {
            along: p.radius * cloud.elongation,
            across: p.radius,
            pole: p.radius * CLOUD_POLE_RATIO,
          };
    const mass = massPerR2 * p.radius * p.radius;
    const amplitude = mass / (TAU_ROOT3 * sigmas.along * sigmas.across * sigmas.pole);
    return {
      amplitude,
      ...inverseCovarianceFromFrame(p.frame, sigmas),
      // Extinction RATIOS, not an emission tint — see `dustExtinctionRgb`.
      color: extinctionRgb,
      center: p.center,
      boundRadius: Math.max(sigmas.along, sigmas.across, sigmas.pole),
    };
  });
}
