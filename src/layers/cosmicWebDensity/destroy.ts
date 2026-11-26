/**
 * destroy — WebGPU frees nothing on GC, so every handle is released by hand. The mask slot goes
 * first: releasing it aborts a fetch in flight, so no late write lands on the destroyed texture.
 */

import type { CosmicWebDensityRuntime } from './@types/CosmicWebDensityRuntime';

export function destroy(runtime: CosmicWebDensityRuntime): void {
  runtime.jitterMaskSlot.release();
  runtime.renderer.destroy();
  runtime.upsample.destroy();
  // After the renderer: its bind groups reference the mask.
  runtime.jitterMask.destroy();
}
