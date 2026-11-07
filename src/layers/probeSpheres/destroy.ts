/** destroy — WebGPU frees nothing on GC, so the renderer is released by hand. */

import type { ProbeSpheresRuntime } from './@types/ProbeSpheresRuntime';

export function destroy(runtime: ProbeSpheresRuntime): void {
  runtime.glintRenderer.destroy();
}
