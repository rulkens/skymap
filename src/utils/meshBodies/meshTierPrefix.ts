import type { Tier } from '../../@types/data/Tier';

/** `meshes/<meshKey>-<tier>` — the stem every tiered mesh file hangs off,
 *  shared by `meshFetcher` (reads it) and `buildMeshes` (writes it), named
 *  like the catalog tiers (`sdss-small.bin`), not the texture px cap. */
export function meshTierPrefix(meshKey: string, tier: Tier): string {
  return `meshes/${meshKey}-${tier}`;
}
