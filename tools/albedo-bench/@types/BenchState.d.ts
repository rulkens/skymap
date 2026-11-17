import type { createBenchStore } from '../ui/store/createBenchStore';

export type BenchState = ReturnType<ReturnType<typeof createBenchStore>['getState']>;
