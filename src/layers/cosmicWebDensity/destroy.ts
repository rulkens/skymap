/** destroy — WebGPU frees nothing on GC, so every handle is released by hand. */

import type { CosmicWebDensityRuntime } from './@types/CosmicWebDensityRuntime';

export function destroy(runtime: CosmicWebDensityRuntime): void {
  runtime.renderer.destroy();
  runtime.upsample.destroy();
  // After the renderer: its bind groups reference the mask.
  runtime.jitterMask.destroy();
}
