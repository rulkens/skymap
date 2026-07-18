import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../@types/data/RingTextureId';
import type { TextureKind } from '../../@types/data/TextureKind';
import type { BodyTextureSlotKey } from '../../@types/data/BodyTextureSlotKey';

/**
 * bodyTextureSlotKey — join a `(bodyId, kind)` pair into the composite
 * `BodyTextureSlotKey` string the `bodyTextures` slot family keys on.
 *
 * The single home for the `:`-joined encoding: the slot `Map` key, the
 * `AssetKey` union member, and the `AssetWiringRow.key` all flow through here, so
 * the structured `BodyTextureKey` and its flat-string twin can never drift onto
 * different separators.
 */
export function bodyTextureSlotKey(
  bodyId: BodyTextureId | RingTextureId,
  kind: TextureKind,
): BodyTextureSlotKey {
  return `${bodyId}:${kind}`;
}
