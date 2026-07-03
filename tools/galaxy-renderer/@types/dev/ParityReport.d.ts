/**
 * ParityReport — the result of one `runGpuParity()` call: a GPU-vs-CPU
 * comparison of one galaxy's generated stars and dust, computed entirely in
 * aggregate (never per-record — see `gpuParityHarness.ts`'s module header for
 * why a record-for-record comparison isn't meaningful here). `stars` and
 * `dust` share an identical shape, inlined twice rather than factored into a
 * second named type so this file keeps exactly one exported symbol.
 *
 * Every `flag` is `'PASS' | 'CHECK'`: an advisory read for a developer
 * scanning `console.table` output, not a pass/fail contract anything asserts
 * on. `perPopulation` has no CPU column because the CPU model has no
 * matching per-population counter to read — its builders write straight into
 * one flat, ungapped array — so it can only report the GPU side against the
 * carved layout's own loop-bound (`layoutIterations`), not a CPU count.
 */

export type ParityReport = {
  readonly stars: {
    readonly total: {
      readonly gpu: number;
      readonly cpu: number;
      readonly deltaPct: number;
      readonly flag: 'PASS' | 'CHECK';
    };
    readonly perPopulation: readonly {
      readonly popId: number;
      readonly gpuLiveCount: number;
      readonly layoutIterations: number;
    }[];
    readonly histogram: readonly {
      readonly bin: number;
      readonly gpu: number;
      readonly cpu: number;
      readonly relDeltaPct: number;
      readonly flag: 'PASS' | 'CHECK';
    }[];
    readonly meanColor: {
      readonly gpu: readonly [number, number, number];
      readonly cpu: readonly [number, number, number];
      readonly flag: 'PASS' | 'CHECK';
    };
    readonly summedIntensity: {
      readonly gpu: number;
      readonly cpu: number;
      readonly deltaPct: number;
      readonly flag: 'PASS' | 'CHECK';
    };
  };
  readonly dust: {
    readonly total: {
      readonly gpu: number;
      readonly cpu: number;
      readonly deltaPct: number;
      readonly flag: 'PASS' | 'CHECK';
    };
    readonly perPopulation: readonly {
      readonly popId: number;
      readonly gpuLiveCount: number;
      readonly layoutIterations: number;
    }[];
    readonly histogram: readonly {
      readonly bin: number;
      readonly gpu: number;
      readonly cpu: number;
      readonly relDeltaPct: number;
      readonly flag: 'PASS' | 'CHECK';
    }[];
    readonly meanColor: {
      readonly gpu: readonly [number, number, number];
      readonly cpu: readonly [number, number, number];
      readonly flag: 'PASS' | 'CHECK';
    };
    readonly summedIntensity: {
      readonly gpu: number;
      readonly cpu: number;
      readonly deltaPct: number;
      readonly flag: 'PASS' | 'CHECK';
    };
  };
};
