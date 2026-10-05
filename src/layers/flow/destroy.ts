/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { FlowRuntime } from './@types/FlowRuntime';

export function destroy(runtime: FlowRuntime): void {
  runtime.renderer.destroy();
}
