/**
 * computePlaceDustBudget — the reservation + per-rebuild uniform inputs, a
 * pure function of (geometry, dust) with no rng/placement work. Its own
 * file, deliberately separate from `createIsmMapPlaceDust.ts`: THAT file's
 * `?static` shader import only resolves under the Vite/wesl-plugin pipeline,
 * but `probeGpuErrors.ts` imports this pure function directly on the plain
 * Node/tsx side — importing from a `?static`-importing module there throws
 * `ERR_UNKNOWN_FILE_EXTENSION` before the probe boots a browser.
 */
import {
  COMPLEX_SPREAD_PC,
  MAX_PARTICLE_COUNT,
  SIZE_MAX_PC,
  SIZE_MIN_PC,
} from '../../../../engine/galaxyGenerator/v2/dustParticleCloud';
import { dustDiscShape, dustSigmaR } from '../../../../engine/galaxyGenerator/v2/galaxyDustMixture';
import {
  DISC_SIGMA_RATIOS,
  DISC_SURFACE_WEIGHTS,
} from '../../../../engine/galaxyGenerator/v2/discSurfaceFit';
import { dustExtinctionRgb } from '../../../../../utils/galaxy/dustExtinctionRgb';
import { stretchExtinctionChroma } from '../../../../../utils/galaxy/stretchExtinctionChroma';
import { pcToUnits } from '../../../../../utils/galaxy/pcToUnits';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyDustParams } from '../../../../../@types/galaxy/GalaxyDustParams';

export type PlaceDustBudget = {
  /** Reserved slot count — `repackFieldComponents`'s dust range sizes off this, not off any placed particle. */
  readonly count: number;
  readonly childrenPerComplex: number;
  readonly complexSpread: number;
  readonly elongation: number;
  readonly sigmaZComplex: number;
  readonly discWeightSum: number;
  readonly discSigmaR: readonly [number, number, number, number];
  readonly sizeMin: number;
  readonly sizeMax: number;
  readonly extinctionRgb: readonly [number, number, number];
  /**
   * `dust.tau`'s entire measured column, expressed as a MASS total —
   * `dustParticleCloud.ts:287`'s `totalMass = dust.tau * 2*PI*weightedSigma2`,
   * a pure function of geometry/tuning with no placement dependency (unlike
   * `sumR2`, which only exists after particles land). `ringReduce.wesl`'s
   * survivor-sum kernel divides this by the GPU-computed `sumR2` to get
   * `massPerR2` — see that kernel's own doc.
   */
  readonly totalMass: number;
};

export function computePlaceDustBudget(
  geometry: GalaxyDescription,
  dust: GalaxyDustParams,
): PlaceDustBudget | null {
  const { cloud } = dust;
  if (geometry.light.disc <= 0 || dust.tau <= 0 || cloud.count <= 0) return null;
  const count = Math.min(cloud.count, MAX_PARTICLE_COUNT);

  const floorPc = Math.min(Math.max(cloud.sizeFloorPc, SIZE_MIN_PC), SIZE_MAX_PC * 0.9);
  const sizeMin = pcToUnits(floorPc) * cloud.sizeScale;
  const sizeMax = pcToUnits(SIZE_MAX_PC) * cloud.sizeScale;
  if (!(sizeMin > 0) || !(sizeMax > sizeMin)) return null;

  const shape = dustDiscShape(geometry, dust);
  const extinctionRgb = stretchExtinctionChroma(dustExtinctionRgb(dust.rV), dust.redness ?? 1);
  const sigmaZComplex = shape.sigmaZ * cloud.heightRatio;
  // discSurfaceFit.ts's DISC_SIGMA_RATIOS is fixed at 4 entries — indexed
  // directly rather than via a runtime loop, so a future 5th component fails
  // typecheck here (the tuple type below) instead of silently truncating.
  const discSigmaR: [number, number, number, number] = [
    dustSigmaR(0, shape),
    dustSigmaR(1, shape),
    dustSigmaR(2, shape),
    dustSigmaR(3, shape),
  ];

  // Larson's third law weighted mean (dustParticleCloud.ts:282-287) — reuses
  // `discSigmaR` above rather than re-calling `dustSigmaR`, same values.
  let weightedSigma2 = 0;
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    weightedSigma2 += (DISC_SURFACE_WEIGHTS[i]! / shape.sumW) * discSigmaR[i]! ** 2;
  }
  const totalMass = dust.tau * 2 * Math.PI * weightedSigma2;

  return {
    count,
    childrenPerComplex: Math.max(1, Math.round(1 + 15 * cloud.clumpiness)),
    complexSpread: pcToUnits(COMPLEX_SPREAD_PC),
    elongation: cloud.elongation,
    sigmaZComplex,
    discWeightSum: shape.sumW,
    discSigmaR,
    sizeMin,
    sizeMax,
    extinctionRgb,
    totalMass,
  };
}
