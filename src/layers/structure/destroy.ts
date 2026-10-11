/**
 * destroy — WebGPU frees nothing on GC, so both marker renderers are released
 * by hand. The slot holds CPU data only, and no Layer releases one at teardown.
 */

import type { StructureRuntime } from './@types/StructureRuntime';

export function destroy(runtime: StructureRuntime): void {
  runtime.nearRenderer.destroy();
  runtime.cosmoRenderer.destroy();
}
