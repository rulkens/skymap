import type { AssetKey } from '../../@types/loading/AssetKey';
import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../@types/data/RingTextureId';
import { ALL_BODY_TEXTURE_KEYS } from '../../data/bodies/bodyTextureKeys';

// Built once at module load from the authored key list, so the membership test
// is an O(1) Set lookup rather than a per-call array scan (the demand loop hits
// this per body per re-evaluation).
const BODY_TEXTURE_KEY_SET: ReadonlySet<string> = new Set(ALL_BODY_TEXTURE_KEYS);

/**
 * isBodyTextureKey — type guard splitting the `bodyTextures` family keys out of
 * the wider `AssetKey` union.
 *
 * The family's slots live in the keyed `state.assetSlots.bodyTextures` Map, not
 * as named fields like the other sidecar assets, so `slotFor` and
 * `installLoadProgress` must route a body-texture key to the Map and every other
 * string key to its named field. Because the two homes are structurally
 * different, a runtime membership check alone is not enough — the guard's
 * `key is BodyTextureId | RingTextureId` narrowing is what lets the else-branch
 * index the named fields without a cast, preserving the compile-time drift
 * protection (a sidecar key with no matching `EngineAssetSlots` field fails to
 * compile).
 */
export function isBodyTextureKey(key: AssetKey): key is BodyTextureId | RingTextureId {
  return typeof key === 'string' && BODY_TEXTURE_KEY_SET.has(key);
}
