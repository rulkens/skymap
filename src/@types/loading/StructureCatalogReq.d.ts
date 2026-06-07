/**
 * The request shape `structureCatalogFetcher` accepts. Empty — the cluster
 * catalog is a standalone boot-time asset, neither tiered (unlike
 * `FilamentReq`, which carries `tier`) nor per-survey (unlike
 * `CompanionAssetReq`). The empty-object type keeps the `Fetcher<T, Req>`
 * generic honest: there is genuinely nothing to vary the fetch on.
 */
export type StructureCatalogReq = Record<string, never>;
