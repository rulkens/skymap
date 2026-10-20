import type { LayerTerrain } from '../../../@types/engine/layer/LayerTerrain';
import { FLAT_TERRAIN } from '../../../data/camera/flatTerrain';

/** One ground per composition: two providers would make the camera's height depend on fold order. */
export function composeTerrain(
  providers: readonly { readonly name: string; readonly terrain: LayerTerrain }[],
): LayerTerrain {
  if (providers.length > 1) {
    throw new Error(
      `createLayers: terrain provided twice — ${providers.map((p) => p.name).join(' and ')}`,
    );
  }
  return providers[0]?.terrain ?? FLAT_TERRAIN;
}
