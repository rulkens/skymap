import type { SourceType } from '../data/SourceType';
import type { BodyTextureSlotKey } from '../data/BodyTextureSlotKey';

/**
 * AssetKey — the registry key for every fetchable asset in the engine's
 * asset-wiring layer: all of `SourceType`, plus string keys for assets that don't
 * map one-to-one onto a `Source`. The two sets differ in both directions. Cluster,
 * Supercluster and Void all arrive via the single `'structureCatalog'` fetch, so a
 * per-source key would pull one file three times; conversely `'cf4Density'`,
 * `'mcpm'`, `'flow'` and `'constellations'` do have `Source` codes but their slots
 * are named `assetSlots` fields, and only a string key routes through `slotFor`.
 * See ADR 0005 §2 for the identity-vs-wiring split; `EngineAssetSlots` for the slots.
 */
export type AssetKey =
  | SourceType
  | 'structureCatalog'
  | 'famousGalaxiesMeta'
  | 'famousStarsMeta'
  | 'pgcAlias'
  | 'filaments'
  | 'cf4Density' // the DEV-only `debug-*` synthetic cubes are deliberately absent — they live in `assetSlots.syntheticVolumes`, outside the demand-driven asset set
  | 'mcpm'
  | 'flow'
  | 'polyphorm2Mrs'
  | 'mcpmWorkbench'
  | 'constellations'
  | 'bodyTextureAtlas'
  | BodyTextureSlotKey; // keyed family; `slotFor` routes these through `assetSlots.bodyTextures` via `isBodyTextureKey`
