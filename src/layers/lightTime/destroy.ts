/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { LightTimeRuntime } from './@types/LightTimeRuntime';

export function destroy(runtime: LightTimeRuntime): void {
  runtime.renderer.destroy();
}
