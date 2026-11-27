import type { TerrainQueries } from '../../../@types/camera/terrain/TerrainQueries';
import { datumOnlyTerrainHeight } from '../../../utils/camera/terrain/datumOnlyTerrainHeight';

/** One ground per composition: two providers would make the camera's height depend on fold order. */
export function composeTerrain(
  providers: readonly { readonly name: string; readonly terrain: TerrainQueries }[],
): TerrainQueries {
  if (providers.length > 1) {
    throw new Error(
      `createLayers: terrain provided twice — ${providers.map((p) => p.name).join(' and ')}`,
    );
  }
  return providers[0]?.terrain ?? { heightAt: datumOnlyTerrainHeight };
}
