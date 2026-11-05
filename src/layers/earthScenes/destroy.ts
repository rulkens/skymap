/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { EarthScenesRuntime } from './@types/EarthScenesRuntime';

export function destroy(runtime: EarthScenesRuntime): void {
  runtime.glintRenderer.destroy();
}
