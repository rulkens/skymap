import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import type { TextureKind } from '../../../@types/data/TextureKind';

/**
 * BodyTextureSlotKey — `${bodyId}:${kind}`, the one primitive the `bodyTextures`
 * Map key, the `BodyAssetKey` member and `AssetWiringRow.key` must agree on.
 * The separator is `:`, not `-`, which already appears inside body ids
 * (`saturn-ring`). Built only via `bodyTextureSlotKey`.
 */
export type BodyTextureSlotKey = `${BodyTextureId | RingTextureId}:${TextureKind}`;
