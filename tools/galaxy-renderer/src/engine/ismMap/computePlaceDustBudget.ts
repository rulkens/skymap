/**
 * computePlaceDustBudget — the reservation + per-rebuild uniform inputs
 * `buildDustParticleCloud`'s CPU setup (`dustParticleCloud.ts:130-156`)
 * still owns, pure function of (geometry, dust), no rng/placement work.
 * `null` mirrors that function's own early `return []`s (geometry/tau/
 * count/size gates).
 *
 * Its own file, deliberately separate from `createIsmMapPlaceDust.ts`: THAT
 * file's `?static` shader import only resolves under the Vite/wesl-plugin
 * pipeline, but `probeGpuErrors.ts` imports this pure function directly on
 * the plain Node/tsx side (no Vite) for its own CPU budget-math check —
 * importing anything from a `?static`-importing module there throws
 * `ERR_UNKNOWN_FILE_EXTENSION` before the probe even boots a browser.
 */
import {
  COMPLEX_SPREAD_PC,
  MAX_PARTICLE_COUNT,
  SIZE_MAX_PC,
  SIZE_MIN_PC,
} from '../../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import {
  dustDiscShape,
  dustSigmaR,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyDustMixture';
import { dustExtinctionRgb } from '../../../../../src/utils/galaxy/dustExtinctionRgb';
import { stretchExtinctionChroma } from '../../../../../src/utils/galaxy/stretchExtinctionChroma';
import { pcToUnits } from '../../../../../src/utils/galaxy/pcToUnits';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';

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
  };
}
