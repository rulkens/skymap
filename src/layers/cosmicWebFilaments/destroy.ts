/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { FilamentsRuntime } from './@types/FilamentsRuntime';

export function destroy(runtime: FilamentsRuntime): void {
  runtime.renderer.destroy();
}
