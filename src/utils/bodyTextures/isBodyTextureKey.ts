import type { AssetKey } from '../../@types/loading/AssetKey';
import type { BodyTextureSlotKey } from '../../@types/data/BodyTextureSlotKey';
import { ALL_BODY_TEXTURE_KEYS } from '../../data/bodies/bodyTextureKeys';
import { bodyTextureSlotKey } from './bodyTextureSlotKey';

// Built once at module load from the authored key list — the composite
// `bodyId:kind` strings — so the membership test is an O(1) Set lookup rather
// than a per-call array scan (the demand loop hits this per body per
// re-evaluation).
const BODY_TEXTURE_KEY_SET: ReadonlySet<string> = new Set(
  ALL_BODY_TEXTURE_KEYS.map((e) => bodyTextureSlotKey(e.bodyId, e.kind)),
);

/**
 * isBodyTextureKey — type guard splitting the `bodyTextures` family keys out of
 * the wider `AssetKey` union.
 *
 * The family's slots live in the keyed `state.assetSlots.bodyTextures` Map, not
 * as named fields like the other sidecar assets, so `slotFor` and
 * `installLoadProgress` must route a body-texture key to the Map and every other
 * string key to its named field. Because the two homes are structurally
 * different, a runtime membership check alone is not enough — the guard's
 * `key is BodyTextureSlotKey` narrowing is what lets the else-branch index the
 * named fields without a cast, preserving the compile-time drift protection (a
 * sidecar key with no matching `EngineAssetSlots` field fails to compile).
 */
export function isBodyTextureKey(key: AssetKey): key is BodyTextureSlotKey {
  return typeof key === 'string' && BODY_TEXTURE_KEY_SET.has(key);
}
