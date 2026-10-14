/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { StellarStreamsRuntime } from './@types/StellarStreamsRuntime';

export function destroy(runtime: StellarStreamsRuntime): void {
  runtime.renderer.destroy();
}
