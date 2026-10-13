/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { MissionsRuntime } from './@types/MissionsRuntime';

export function destroy(runtime: MissionsRuntime): void {
  runtime.renderer.destroy();
}
