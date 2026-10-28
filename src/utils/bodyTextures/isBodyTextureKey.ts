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
 * isBodyTextureKey — type guard splitting the body Layer's texture keys out of the
 * wider `AssetKey` union, so the named-field slot walks can skip them without a cast.
 */
export function isBodyTextureKey(key: AssetKey): key is BodyTextureSlotKey {
  return typeof key === 'string' && BODY_TEXTURE_KEY_SET.has(key);
}
