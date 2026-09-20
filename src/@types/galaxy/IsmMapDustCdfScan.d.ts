import type { IsmMapCdfScanGrid } from './IsmMapCdfScanGrid';
import type { IsmMapCdfWeightTable } from './IsmMapCdfWeightTable';

export type IsmMapDustCdfScan = {
  /** `grid.rings * grid.az` floats after `dispatchScan` — the running mass through each texel, `buildIsmMapDustCdf.ts`'s own `prefix` array. Sized to `maxRings * maxAz`; only the leading `grid.rings * grid.az` floats are meaningful after a call with a smaller grid. */
  readonly prefixBuffer: GPUBuffer;
  /** Encode all three passes into the CALLER's encoder — one compute pass, WebGPU's own cross-dispatch storage-buffer sync (see `createIsmMapFluidRunner.ts`'s own doc) makes a pass split unnecessary. */
  dispatchScan(
    enc: GPUCommandEncoder,
    params: {
      readonly ismMapTexture: GPUTexture;
      readonly grid: IsmMapCdfScanGrid;
      readonly weights: IsmMapCdfWeightTable;
      /** ringReduce.wesl's per-ring dust means (ismMapGenerator.ringMeansBuffer) — always bound, whether the active weight table's own branch reads it or not (evalWeight's static reference — see ismMapDustCdfScan.wesl's own doc). */
      readonly ringMeansBuffer: GPUBuffer;
    },
  ): void;
  dispose(): void;
};
