/** destroy — WebGPU frees nothing on GC, so the lens renderer is released by hand. */

import type { BlackHolesRuntime } from './@types/BlackHolesRuntime';

export function destroy(runtime: BlackHolesRuntime): void {
  runtime.lensRenderer.destroy();
}
