/** destroy — WebGPU frees nothing on GC; the cancel keeps an in-flight bin from uploading after. */

import type { StellarStreamsRuntime } from './@types/StellarStreamsRuntime';

export function destroy(runtime: StellarStreamsRuntime): void {
  runtime.slot.cancel();
  runtime.renderer.destroy();
  runtime.hazeUpsample.destroy();
}
