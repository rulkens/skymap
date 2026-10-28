/**
 * destroy — the slots first, then the renderers they write, in reverse construction
 * order. Core's asset queue lets an in-flight fetch run out, so without the cancel its
 * commit would land on a destroyed renderer; WebGPU frees nothing on GC, so the
 * renderers are released by hand.
 */

import type { BodyRuntime } from './@types/BodyRuntime';

export function destroy(runtime: BodyRuntime): void {
  runtime.atlasSlot.cancel();
  for (const slot of runtime.textureSlots.values()) slot.cancel();
  runtime.glint.destroy();
  runtime.atmosphere.destroy();
  runtime.cloudShell.destroy();
  runtime.ring.destroy();
  runtime.planet.destroy();
  runtime.texturedBody.destroy();
  runtime.terrainPickMarker.destroy();
  runtime.surfaceTile.destroy();
  runtime.earth.destroy();
}
