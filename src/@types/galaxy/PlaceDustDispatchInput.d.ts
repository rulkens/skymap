import type { PlaceDustBudget } from './PlaceDustBudget';
import type { PlaceDustGrid } from './PlaceDustGrid';
import type { PlaceDustWarp } from './PlaceDustWarp';

export type PlaceDustDispatchInput = {
  readonly seed: number;
  readonly budget: PlaceDustBudget;
  readonly dustOffset: number;
  readonly generatorIsFluid: boolean;
  readonly grid: PlaceDustGrid;
  readonly warp: PlaceDustWarp;
  /** The CDF scan output over the dust channel — see createIsmMapDustCdfScan.ts. */
  readonly prefixBuffer: GPUBuffer;
  /** ismMapGenerator.ringMeansBuffer — ringReduce.wesl's per-ring dust means. */
  readonly ringMeansBuffer: GPUBuffer;
  readonly ismMapTexture: GPUTexture;
  readonly orientationTexture: GPUTexture;
  readonly fieldCompsBuffer: GPUBuffer;
};
