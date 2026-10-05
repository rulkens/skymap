/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { ConstellationsRuntime } from './@types/ConstellationsRuntime';

export function destroy(runtime: ConstellationsRuntime): void {
  runtime.renderer.destroy();
}
