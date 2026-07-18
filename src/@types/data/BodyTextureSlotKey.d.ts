import type { BodyTextureId } from './BodyTextureId';
import type { RingTextureId } from './RingTextureId';
import type { TextureKind } from './TextureKind';

/**
 * BodyTextureSlotKey — the composite `\`${bodyId}:${kind}\`` string that is the
 * single comparable value the body-texture family keys on: the `bodyTextures`
 * `Map` key, the `AssetKey` union member, and the `AssetWiringRow.key`. Those
 * three must agree on one primitive (`slotFor` resolves `row.key` → the Map), so
 * the family carries a flat string alongside its structured `BodyTextureKey`.
 *
 * The separator is `:` — deliberately not `-`, which already appears inside a
 * body id (`saturn-ring`) and would make the split ambiguous. Built only via
 * `bodyTextureSlotKey`, so the encoding lives in exactly one place.
 */
export type BodyTextureSlotKey = `${BodyTextureId | RingTextureId}:${TextureKind}`;
