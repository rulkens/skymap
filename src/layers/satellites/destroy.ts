/** destroy — the worker, the pending wake and the GPU buffers are freed by hand; nothing here is GC'd. */
import type { SatellitesRuntime } from './@types/SatellitesRuntime';

export function destroy(runtime: SatellitesRuntime): void {
  runtime.cancelWake();
  runtime.selected.stop();
  runtime.propagator.stop();
  runtime.renderer.destroy();
}
