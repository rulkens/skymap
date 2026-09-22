/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { CosmicWebFilamentsRuntime } from './@types/CosmicWebFilamentsRuntime';

export function destroy(runtime: CosmicWebFilamentsRuntime): void {
  runtime.renderer.destroy();
}
