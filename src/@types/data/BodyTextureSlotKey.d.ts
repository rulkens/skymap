import type { BodyTextureId } from './BodyTextureId';
import type { RingTextureId } from './RingTextureId';
import type { TextureKind } from './TextureKind';

/**
 * BodyTextureSlotKey — `${bodyId}:${kind}`, the one primitive the `bodyTextures`
 * Map key, the `AssetKey` member and `AssetWiringRow.key` must agree on.
 * The separator is `:`, not `-`, which already appears inside body ids
 * (`saturn-ring`). Built only via `bodyTextureSlotKey`.
 */
export type BodyTextureSlotKey = `${BodyTextureId | RingTextureId}:${TextureKind}`;
