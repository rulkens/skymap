import type { Tier } from '../../@types/data/Tier';
import { tierToTexturePx } from '../math/tierToTexturePx';

/** `meshes/<meshKey>-<px>` — the stem every tiered mesh file hangs off,
 *  shared by `meshFetcher` (reads it) and `buildMeshes` (writes it). */
export function meshTierPrefix(meshKey: string, tier: Tier): string {
  return `meshes/${meshKey}-${tierToTexturePx(tier)}`;
}
