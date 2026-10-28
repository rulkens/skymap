import type { SourceType } from '../data/SourceType';
import type { BodyTextureSlotKey } from '../data/BodyTextureSlotKey';

/**
 * AssetKey — registry key for every fetchable asset: all of `SourceType` plus string
 * keys for assets that don't map one-to-one onto a `Source`. Cluster, Supercluster
 * and Void share the single `'structureCatalog'` fetch; `'flow'` has a `Source`
 * code but its slot is keyed by the string. See ADR 0005 §2.
 */
export type AssetKey =
  | SourceType
  | 'structureCatalog'
  | 'famousGalaxiesMeta'
  | 'famousStarsMeta'
  | 'pgcAlias'
  | 'filaments'
  | 'localBubble'
  | 'satellites'
  | 'flow'
  | 'constellations'
  | 'bodyTextureAtlas'
  | 'hiResFamous' // a GPU allocation, not a fetch; its request is keyed on `layerSide`, not the tier
  | BodyTextureSlotKey
  | `mesh:${string}`; // one per body id; the prefix keeps this a template type instead of widening the union to `string`
