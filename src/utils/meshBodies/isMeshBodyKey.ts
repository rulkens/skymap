import type { AssetKey } from '../../@types/loading/AssetKey';

/** isMeshBodyKey — type guard splitting the mesh-body family's demand-row
 *  keys out of `AssetKey`, mirroring `isBodyTextureKey`. */
export function isMeshBodyKey(key: AssetKey): key is `mesh:${string}` {
  return typeof key === 'string' && key.startsWith('mesh:');
}
