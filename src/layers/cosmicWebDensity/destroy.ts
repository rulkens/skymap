/** destroy — WebGPU frees nothing on GC, so both handles are released by hand. */

import type { CosmicWebDensityRuntime } from './@types/CosmicWebDensityRuntime';

export function destroy(runtime: CosmicWebDensityRuntime): void {
  runtime.renderer.destroy();
  runtime.upsample.destroy();
}
