/**
 * destroy — the readout's trailing wake (it would land on a stopped loop), then the
 * tile stream (it owns two atlases once engaged), then the slots, then
 * the renderers they write, in reverse construction order. Core's asset queue lets an
 * in-flight fetch run out, so without the cancel its commit would land on a destroyed
 * renderer; WebGPU frees nothing on GC, so the renderers are released by hand.
 */

import type { BodyRuntime } from './@types/BodyRuntime';

export function destroy(runtime: BodyRuntime): void {
  runtime.readoutGate.cancel();
  runtime.surfaceTiles.stream.destroy();
  runtime.atlasSlot.cancel();
  for (const slot of runtime.textureSlots.values()) slot.cancel();
  runtime.bodyGlintRenderer.destroy();
  runtime.atmosphereShellRenderer.destroy();
  runtime.cloudShellRenderer.destroy();
  runtime.ringRenderer.destroy();
  runtime.planetRenderer.destroy();
  runtime.texturedBodyRenderer.destroy();
  runtime.terrainPickMarkerRenderer.destroy();
  runtime.surfaceTileRenderer.destroy();
  runtime.earthRenderer.destroy();
}
