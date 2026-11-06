import type { createBenchStore } from '../ui/store/createBenchStore';

export type BenchDispatch = ReturnType<typeof createBenchStore>['dispatch'];
