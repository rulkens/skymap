import type { TerrainHeightAtLookup } from '../../../@types/camera/TerrainHeightAtLookup';
import { datumOnlyTerrainHeight } from '../../../utils/camera/datumOnlyTerrainHeight';

/** One ground per composition: two providers would make the camera's height depend on fold order. */
export function composeTerrainHeightAt(
  providers: readonly { readonly name: string; readonly heightAt: TerrainHeightAtLookup }[],
): TerrainHeightAtLookup {
  if (providers.length > 1) {
    throw new Error(
      `createLayers: heightAt provided twice — ${providers.map((p) => p.name).join(' and ')}`,
    );
  }
  return providers[0]?.heightAt ?? datumOnlyTerrainHeight;
}
