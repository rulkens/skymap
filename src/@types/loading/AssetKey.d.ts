/**
 * AssetKey — the registry key of one asset row, as core handles it: generically, never by
 * name. Each Layer owns the keys it authors in its own `@types/` (`GalaxyCatalogAssetKey`,
 * …), string literals or the id of a catalog it streams; core authors
 * only `mesh:<bodyId>` (`meshBodySlotKey`). No core code names a Layer's key, so nothing
 * here lists them. See ADR 0005 §2.
 */
export type AssetKey = string;
