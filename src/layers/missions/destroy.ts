/** destroy — WebGPU frees nothing on GC, so the renderers are released by hand. */

import type { MissionsRuntime } from './@types/MissionsRuntime';

export function destroy(runtime: MissionsRuntime): void {
  runtime.trailRenderer.destroy();
  runtime.glintRenderer.destroy();
}
