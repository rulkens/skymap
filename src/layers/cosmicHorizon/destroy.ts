/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { CosmicHorizonRuntime } from './@types/CosmicHorizonRuntime';

export function destroy(runtime: CosmicHorizonRuntime): void {
  runtime.renderer.destroy();
}
