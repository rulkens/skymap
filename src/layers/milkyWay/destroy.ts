/**
 * destroy — WebGPU frees nothing on GC, so every handle is released by
 * hand, in reverse construction order (mirroring core's old teardown walk).
 */

import type { MilkyWayRuntime } from './@types/MilkyWayRuntime';

export function destroy(runtime: MilkyWayRuntime): void {
  runtime.aggregateUpsample.destroy();
  runtime.cloudRenderer.destroy();
  runtime.cloud.destroy();
  runtime.pickRenderer.destroy();
}
