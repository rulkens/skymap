/** destroy — WebGPU frees nothing on GC, so every handle is released by hand. The slots go first
 *  (releasing one aborts a fetch in flight, so no late commit lands on the destroyed renderer or
 *  mask), the regions before the renderer (it borrows their textures), the mask last (the
 *  renderer's bind groups reference it). */

import type { CosmicWebDensityRuntime } from './@types/CosmicWebDensityRuntime';

export function destroy(runtime: CosmicWebDensityRuntime): void {
  for (const slot of Object.values(runtime.slots)) slot.release();
  runtime.jitterMaskSlot.release();
  runtime.regions.destroy();
  runtime.renderer.destroy();
  runtime.upsample.destroy();
  runtime.jitterMask.destroy();
}
