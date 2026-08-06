/**
 * buildDustParticleCloud — the galaxy's ONLY dust tier (the smooth analytic
 * lane it used to be layered on was deleted — see `galaxyDustMixture.ts`'s
 * header): small anisotropic 3D Gaussians standing in for GMC/cloud
 * complexes, splatted through `dustMap.wesl`, carrying the galaxy's FULL
 * `dust.tau` rather than a share of it. Three anchors: Larson's third law
 * (mass ~ R^2 at ~constant cloud surface density, so every cloud peaks at
 * roughly the same tau — sharp, separated clouds, not a haze); the R^-2.2
 * GMC size function (Watkins+2023); ISM hierarchical clustering, as a
 * two-level complex/children placement — the ISM map when usable, else a
 * plain smooth disc, no arm-lane machinery of its own (that stayed with
 * `armParticleCloud.ts`; see `buildDustParticleCloud`'s own placement
 * comment).
 *
 * No cavity carving here any more — the seeded SF-event catalog
 * (`dustBubblePlacements.ts`) used to sweep particles onto bubble/HII rims,
 * a second, independent star-formation model carving the same holes the
 * SSPSF automaton's own gas depletion already produces (`ismMap`, read via
 * its own raw `dust` channel below). The map is now the only thing that
 * shapes dust, so until the automaton's depletion is tuned to carve on its
 * own, dust has no cavity holes and HII regions (still seeded from the
 * event catalog) can sit inside dust that no longer has a hole for them.
 *
 * PURITY INVARIANT: pure `(geometry, dust, tuning, seed, ismMap,
 * ismMapOrientation) -> flat data`, no Math.random/Date/engine state — a
 * Worker/compute-pass candidate. `ismMap`/`ismMapOrientation` are plain
 * sampled arrays (see `GalaxyIsmMap`/`GalaxyIsmMapOrientation`), so both stay
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
import { buildIsmMapDustCdf } from '../../../../utils/galaxy/buildIsmMapDustCdf';
import type { IsmMapDensityTexel } from '../../../../utils/galaxy/buildIsmMapDustCdf';
import { dustExtinctionRgb } from '../../../../utils/galaxy/dustExtinctionRgb';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { pcToUnits } from '../../../../utils/galaxy/pcToUnits';
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

/**
 * GMC associations run 300-800 pc (the same scale as the measured spur
 * spacing); this is the child scatter's one-sigma, before elongation.
 *
 * NOT scaled by `sizeScale`, unlike the size draw below: that knob's contract
 * is the cloud SIZE range, and a scatter that tracked it would translate every
 * particle away from its complex's seed point in proportion to the knob — the
 * whole tier scaling about its seeds instead of each cloud growing in place.
 */
const COMPLEX_SPREAD_PC = 250;

/** Clouds are flattened relative to their in-plane extent. */
const CLOUD_POLE_RATIO = 0.6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

/**
 * S3 survival floor — keyed on the SAME channel placement itself draws from
 * (the map's raw `dust` channel), not the legacy `gas x activity` product; a
 * map-seeded particle whose own texel sits below this is dropped AFTER
 * placement, a post-filter that never touches the rng stream S1's CDF
 * sampler consumed. Its job persists from the old filter: cluster children
 * scatter `COMPLEX_SPREAD_PC` around their complex's seed point and can
 * straddle into a true cavity placement itself would never pick (the CDF
 * only draws complex CENTRES from dusty mass).
 *
 * A FRACTION of the sampled texel's OWN RING mean, not the map's global
 * mean: a cavity is low RELATIVE TO ITS RING, not relative to the whole
 * disc — the outer disc's honest faintness (its ring mean is naturally far
 * below the inner disc's) must not mass-cull outer splats the radial
 * envelope legitimately placed. Same reasoning rules out an absolute
 * constant: the ambient pedestal is seeded `ambient * gasProfile(r)` and
 * advected, so it varies by radius and by how far the sim has run; ring-
 * relative keeps the floor's MEANING fixed ("clear noise near zero, don't
 * compete with real signal") at every radius.
 *
 * Exported: the "seeding" debug view in `ismMapPresent.wesl` mirrors this
 * fraction (parity-tested in `constants.parity.test.ts`) so a texel that
 * would never keep a particle here never glows there either.
 */
export const DUST_SURVIVAL_FLOOR_FRAC = 0.01;

/**
 * Below this GLOBAL mean (the mean of every ring's own mean — see
 * `buildDustParticleCloud`'s placement comment), the map is transport-off/
 * early-run noise (every texel near its own seed pedestal) — too close to
 * zero to divide by without blowing the density up toward Infinity/NaN.
 * Below the floor, placement stays at its `smoothDisc` default instead —
 * the same fallback an absent map takes, not a crash.
 */
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
  const extinctionRgb = dustExtinctionRgb(dust.rV);
  const sigmaZCloud = shape.sigmaZ * cloud.heightRatio;

  const rng = mulberry32(seed ^ 0x44555354); // "DUST"

  // A generator running: the map IS the placement density — the map's own
  // raw `dust` channel — every complex is placed by `'mapDensity'` mode, its
  // centre drawn from S1's inverse-CDF sampler (`buildIsmMapDustCdf`).
  // `generator === 'none'` (or a quiet map): `'smoothDisc'` mode, no
  // arm-lane concept at all — the dust tier's analytic lane machinery was
  // cut once the map became the sole placement density; `armParticleCloud.ts`
  // still owns the one live `'analytic'` caller. This is the intended
  // consequence of the ISM map leading, not a regression.
  //
  // RAW dust, not overshoot-above-ambient: the ambient pedestal used to be
  // uniform (`sweptDustOvershoot`'s old subtraction), but it is now seeded
  // `ambient * gasProfile(r)` and advected by the automaton — it IS
  // structure, and subtracting it erased the faint wisps this placement is
  // supposed to seed clouds into. `sweptDustOvershoot` stays in the codebase
  // for the histogram harness; this file no longer imports it.
  //
  // RING-normalised, not a single map-wide mean: the map-wide mean was flat
  // enough for a hot texel's tempering knob to also flatten the RADIAL
  // profile itself — capping a runaway inner-disc rim thinned it out toward
  // parity with the (measured, honestly faint) outer disc, which has vastly
  // more texel COUNT and AREA to win that parity fight with. Density
  // factors into an envelope term (ringMean[ring] / globalMean, untouched by
  // the cap) times a within-ring term (dust / ringMean[ring], capped): the
  // envelope preserves the map's measured radial dust profile EXACTLY at
  // every cap setting, while the cap only redistributes mass AZIMUTHALLY,
  // within a ring, away from a texel that would otherwise starve its
  // neighbours. `globalMean = arrayMean(ringMeans)` is a documented choice,
  // not the only valid one (the flat per-texel mean would equal it here,
  // since every ring shares the same `az` count) — the seeding debug view in
  // `ismMapPresent.wesl` uses the SAME definition, uploaded as the SAME
  // number, so the two cannot drift apart.
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
    // Guard: a map with no dust anywhere (transport off, or the automaton
    // hasn't run long enough yet) leaves `placement` at its `smoothDisc`
    // default instead of dividing by ~0 — the SAME fallback an absent map
    // takes, not a crash.
    if (globalMean >= GLOBAL_MEAN_EPS) {
      // `?? 0`: `dust.cloud` rides the preset wire's raw 'p' key with no
      // per-field defaults-merge (see dustParticleCloud.test.ts's preset-gap
      // test), so a preset saved before this field existed loads it
      // `undefined` — treat that exactly like "uncapped" (cap 0), not NaN.
      // Multiples of the texel's OWN ring mean, not the global mean — see
      // the field's own doc (GalaxyDustCloudParams) for the starvation
      // problem this solves.
      const cap = cloud.dustPlacementCap ?? 0;
      // Cached across the `az` calls `buildIsmMapDustCdf`'s own loop makes at
      // a fixed `radius` before moving to the next ring — this callback runs
      // per texel over the whole 1536x512 grid on every slider change, and
      // `ismMapRingIndexForRadius` is a log/round pair not worth repeating
      // `az` times for the same answer.
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

  // ---- 4b: Larson's third law — mass ~ R^2 (constant cloud surface density) -
  let weightedSigma2 = 0;
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    weightedSigma2 += (DISC_SURFACE_WEIGHTS[i]! / shape.sumW) * dustSigmaR(i, shape) ** 2;
  }
  // dust.tau in FULL — there is no longer a smooth-tier share to debit it by
  // (see galaxyDustMixture.ts's header), so the cloud reads heavier than it
  // did when this was one of two tiers splitting the same measured column.
  const totalMass = dust.tau * 2 * Math.PI * weightedSigma2;
  // Summed AFTER the S3 filter above, so a cavity-dropped particle's R^2
  // share is redistributed onto the survivors and `dust.tau` stays exact.
  let sumR2 = 0;
  for (const p of particles) sumR2 += p.radius * p.radius;
  if (!(totalMass > 0) || !(sumR2 > 0)) return [];
  const massPerR2 = totalMass / sumR2;

  return particles.map((p) => {
    // Map path: AREA-PRESERVING aspect (along x across = R^2 always) so the
    // Larson mass ~ R^2 renormalisation above stays exact per particle, not
    // just in aggregate. Off it: the pre-S3 formula, unchanged (`p.aspect`
    // is `cloud.elongation` there, but plugged into THIS formula it would
    // move every splat's footprint — see 07-sprite-seeding.md S3).
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
