/** destroy — WebGPU frees nothing on GC; the cancels keep an in-flight bin or meta from uploading after. */

import type { StellarStreamsRuntime } from './@types/StellarStreamsRuntime';

export function destroy(runtime: StellarStreamsRuntime): void {
  runtime.slot.cancel();
  runtime.metaSlot.cancel();
  runtime.renderer.destroy();
  runtime.ribbonPick.destroy();
  runtime.hazeUpsample.destroy();
}
