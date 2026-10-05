/** destroy — WebGPU frees nothing on GC, so both handles are released by hand. */

import type { ZoneOfAvoidanceRuntime } from './@types/ZoneOfAvoidanceRuntime';

export function destroy(runtime: ZoneOfAvoidanceRuntime): void {
  runtime.renderer.destroy();
  runtime.upsample.destroy();
}
