import type { BodyTextureId } from './BodyTextureId';
import type { RingTextureId } from './RingTextureId';
import type { TextureKind } from './TextureKind';

/**
 * BodyTextureKey — the structured identity of one entry in the body-texture
 * asset family: which body (or ring strip) and which map role.
 *
 * This is the enumeration unit in `ALL_BODY_TEXTURE_KEYS`, carried by-value
 * through the wiring `req`, the commit dispatch, and the fetcher so `.bodyId` /
 * `.kind` are read directly — no parsing of a composite string. Its flat-string
 * twin `BodyTextureSlotKey` (`\`${bodyId}:${kind}\``) is the comparable value the
 * slot `Map` and `AssetKey` union key on; the two never drift because
 * `bodyTextureSlotKey` derives the string from this pair.
 */
export type BodyTextureKey = {
  readonly bodyId: BodyTextureId | RingTextureId;
  readonly kind: TextureKind;
};
