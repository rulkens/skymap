/**
 * buildDustParticleCloud — the galaxy's ONLY dust tier (the smooth analytic
 * lane it used to be layered on was deleted — see `galaxyDustMixture.ts`'s
 * header): small anisotropic 3D Gaussians standing in for GMC/cloud
 * complexes, splatted through `dustMap.wesl`, carrying the galaxy's FULL
 * `dust.tau` rather than a share of it. Three anchors: Larson's third law
 * (mass ~ R^2 at ~constant cloud surface density, so every cloud peaks at
 * roughly the same tau — sharp, separated clouds, not a haze); the R^-2.2
 * GMC size function (Watkins+2023); ISM hierarchical clustering, as a
 * two-level complex/children placement — the SF map when usable, else a
 * plain smooth disc, no arm-lane machinery of its own (that stayed with
 * `armParticleCloud.ts`; see `buildDustParticleCloud`'s own placement
 * comment).
 *
 * No cavity carving here any more — the seeded SF-event catalog
 * (`dustBubblePlacements.ts`) used to sweep particles onto bubble/HII rims,
 * a second, independent star-formation model carving the same holes the
 * SSPSF automaton's own gas depletion already produces (`sfMap`, read via
 * `sfMapDustDensity` below). The map is now the only thing that shapes
 * dust, so until the automaton's depletion is tuned to carve on its own,
 * dust has no cavity holes and HII regions (still seeded from the event
 * catalog) can sit inside dust that no longer has a hole for them.
 *
 * PURITY INVARIANT: pure `(geometry, dust, tuning, seed, sfMap,
 * sfMapOrientation) -> flat data`, no Math.random/Date/engine state — a
 * Worker/compute-pass candidate. `sfMap`/`sfMapOrientation` are plain
 * sampled arrays (see `GalaxySfMap`/`GalaxySfMapOrientation`), so both stay
 * data arguments like every other one, not an engine dependency.
 * `orientationDeltaStats` is an optional out-param (see its own type doc) —
 * supplying it does not change what this function computes, only what a
 * caller can read off it afterward.
 */
import {
  buildClusteredDiscPlacement,
  type CloudFrame,
  type ClusteredDiscPlacementMode,
  type OrientationDeltaStats,
} from './clusteredDiscPlacement';
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { dustDiscShape, dustSigmaR } from './galaxyDustMixture';
import { dustExtinctionRgb } from '../../../../utils/galaxy/dustExtinctionRgb';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { pcToUnits } from '../../../../utils/galaxy/pcToUnits';
import { sampleGalaxySfMap } from '../../../../utils/galaxy/sampleGalaxySfMap';
import { sfMapDustDensity } from '../../../../utils/galaxy/sfMapDustDensity';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyDustParams } from '../../../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { GalaxySfMap } from '../../../../@types/galaxy/GalaxySfMap';
import type { GalaxySfMapOrientation } from '../../../../@types/galaxy/GalaxySfMapOrientation';
import type { Vec3 } from '../../../../@types/math/Vec3';

const MAX_PARTICLE_COUNT = 40000;

/**
 * GMC size function dN/dR ~ R^-2.2, over the measured 15-200 pc span. ABSOLUTE
 * parsecs, not a fraction of the disc: cloud sizes are set by the ISM's own
 * Jeans/turbulence physics and are near-universal across galaxies, so a dwarf
 * gets the same clouds as a giant, just fewer of them.
 *
 * These bound the whole tier's CONTRAST, which is why they are calibration and
 * not taste. Per-cloud peak tau = dust.tau (the galaxy's full column) / f,
 * with the covering factor f = N * 2*PI * elongation * <R^2> / A_disc. Oversized clouds
 * drive f into the tens, every cloud fades to invisibility to keep the total
 * honest, and the tier reads as a smooth haze — the failure this replaces.
 * f around 2-3 is the target: dark enough per cloud to see, overlapping enough
 * along the arms to mottle rather than dot.
 *
 * `SIZE_MIN_PC` doubles as `sizeFloorPc`'s slider default and lower clamp —
 * raising the floor at fixed `count` raises mean R^2, which raises f (mass is
 * renormalised to the tier's total, `massPerR2 = totalMass / sumR2`), which
 * makes every cloud FAINTER even as it grows. Pull `count` down with the
 * floor to hold per-cloud contrast.
 */
export const SIZE_MIN_PC = 15;
const SIZE_MAX_PC = 200;
const GMC_SIZE_POWER = 2.2;

/**
 * Base world span of one full wrap of the baked ridged-noise volume
 * (dustNoiseBake.wesl), parsecs, before `textureScale`. Its four octave
 * bands sit at 500/250/125/62 pc wavelengths — straddling the 15-200 pc
 * measured cloud-size span above, which is the point: the erosion has to
 * bite at the same scale the clouds themselves live at, not far above or
 * below it.
 */
export const DUST_NOISE_TILE_PC = 500;

/**
 * World-unit tile size for the baked noise volume at a given
 * `textureScale` — the one place `pcToUnits` combines with
 * `DUST_NOISE_TILE_PC`, so `createGalaxyEngine.ts` doesn't restate the
 * kpc-per-unit conversion.
 */
export function dustNoiseTileUnits(textureScale: number): number {
  return pcToUnits(DUST_NOISE_TILE_PC) * textureScale;
}

/** GMC associations run 300-800 pc (the same scale as the measured spur spacing); this is the child scatter's one-sigma, before elongation. */
const COMPLEX_SPREAD_PC = 250;

/** Clouds are flattened relative to their in-plane extent. */
const CLOUD_POLE_RATIO = 0.6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

type CloudParticle = {
  readonly center: Vec3;
  readonly frame: CloudFrame;
  readonly radius: number;
};

/**
 * Peak `sfMapDustDensity` over the whole sampled grid, once per map.
 * Load-bearing: `oldActivity` is small over most of the grid, so rejection
 * sampling on the raw (unnormalised) product would reject nearly everything
 * and silently degenerate to the analytic fallback — the bug this
 * replaces, just quieter. Channel 2 (blue) is `oldActivity`; channel 1 is
 * `recentSf`, which this deliberately does NOT read (see `sfMapDustDensity`).
 */
function maxSfMapDustDensity(map: GalaxySfMap): number {
  let max = 0;
  const { data } = map;
  for (let i = 0; i + 2 < data.length; i += 4) {
    const density = sfMapDustDensity(data[i]! / 255, data[i + 2]! / 255);
    if (density > max) max = density;
  }
  return max;
}

export function buildDustParticleCloud(
  geometry: GalaxyDescription,
  dust: GalaxyDustParams,
  tuning: GalaxyFieldTuning,
  seed: number,
  sfMap: GalaxySfMap | null,
  sfMapOrientation: GalaxySfMapOrientation | null,
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
  const complexSpread = pcToUnits(COMPLEX_SPREAD_PC) * cloud.sizeScale;

  const shape = dustDiscShape(geometry, dust);
  const extinctionRgb = dustExtinctionRgb(dust.rV);
  const sigmaZCloud = shape.sigmaZ * cloud.heightRatio;

  const rng = mulberry32(seed ^ 0x44555354); // "DUST"

  // Seeding ON: the map IS the placement density (a gas x accumulated-activity
  // blend, `sfMapDustDensity`, normalised by its own grid MAXIMUM so a
  // mostly-quiet grid doesn't rejection-sample down to nothing) — every
  // complex is placed by `'mapDensity'` mode. Seeding OFF (or a quiet map):
  // `'smoothDisc'` mode, no arm-lane concept at all — the dust tier's
  // analytic lane machinery was cut once the map became the sole placement
  // density; `armParticleCloud.ts` still owns the one live `'analytic'`
  // caller. This is the intended consequence of the SF map leading, not a
  // regression.
  let placement: ClusteredDiscPlacementMode = { kind: 'smoothDisc' };
  if (tuning.sfMapDustSeeding && sfMap) {
    const maxDensity = maxSfMapDustDensity(sfMap);
    if (maxDensity > 0) {
      placement = {
        kind: 'mapDensity',
        rMin: sfMap.rMin,
        rMax: sfMap.rMax,
        densityAt: (radius, angle) => {
          // Outside the grid's radial support the map has NO DATA, and
          // `sampleGalaxySfMap` CLAMPS rather than reporting that — so every
          // radius below rMin reads ring 0. Left to clamp, the centrally-peaked
          // proposal distribution piles the whole cloud into the inner hole at
          // ring 0's (unburnt, therefore high) density, which is why the dust
          // collected in the central circle the overlay draws as black.
          if (radius < sfMap.rMin || radius > sfMap.rMax) return 0;
          const sample = sampleGalaxySfMap(sfMap, radius, angle);
          return sfMapDustDensity(sample.gas, sample.oldActivity) / maxDensity;
        },
      };
    }
  }

  const particles: CloudParticle[] = buildClusteredDiscPlacement<{ radius: number }>(
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
      // Gated with `placement` above: OFF (the default) is a no-op, so a
      // caller with the map already sampled needn't re-check the flag.
      sfMapOrientation: tuning.sfMapDustSeeding ? sfMapOrientation : null,
      orientationDeltaStats,
    },
    (childRng) => ({ radius: sampleRadius(childRng()) }),
  );

  // ---- 4b: Larson's third law — mass ~ R^2 (constant cloud surface density) -
  let weightedSigma2 = 0;
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    weightedSigma2 += (DISC_SURFACE_WEIGHTS[i]! / shape.sumW) * dustSigmaR(i, shape) ** 2;
  }
  // dust.tau in FULL — there is no longer a smooth-tier share to debit it by
  // (see galaxyDustMixture.ts's header), so the cloud reads heavier than it
  // did when this was one of two tiers splitting the same measured column.
  const totalMass = dust.tau * 2 * Math.PI * weightedSigma2;
  let sumR2 = 0;
  for (const p of particles) sumR2 += p.radius * p.radius;
  if (!(totalMass > 0) || !(sumR2 > 0)) return [];
  const massPerR2 = totalMass / sumR2;

  return particles.map((p) => {
    const sigmas = {
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
