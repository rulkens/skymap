/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { LocalBubbleRuntime } from './types/LocalBubbleRuntime';

export function destroy(runtime: LocalBubbleRuntime): void {
  runtime.renderer.destroy();
}
