import type { SkyGridRuntime } from './@types/SkyGridRuntime';

export function destroy(runtime: SkyGridRuntime): void {
  runtime.renderer.destroy();
}
