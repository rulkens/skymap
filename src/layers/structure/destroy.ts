/**
 * destroy — WebGPU frees nothing on GC, so every renderer is released
 * by hand. The slot holds CPU data only, and no Layer releases one at teardown.
 */

import type { StructureRuntime } from './@types/StructureRuntime';

export function destroy(runtime: StructureRuntime): void {
  runtime.nearRenderer.destroy();
  runtime.orbitRenderer.destroy();
  runtime.orbitPlaneRenderer.destroy();
  runtime.cosmoRenderer.destroy();
}
