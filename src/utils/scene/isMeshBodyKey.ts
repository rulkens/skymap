import type { AssetKey } from '../../@types/loading/AssetKey';

/**
 * isMeshBodyKey — type guard splitting the mesh-body family's demand-row
 * keys out of `AssetKey`, mirroring `isBodyTextureKey`. The `mesh:` prefix
 * alone is a sufficient discriminant (no other `AssetKey` member starts with
 * it), so unlike the body-texture guard this needs no registry membership
 * check.
 */
export function isMeshBodyKey(key: AssetKey): key is `mesh:${string}` {
  return typeof key === 'string' && key.startsWith('mesh:');
}
