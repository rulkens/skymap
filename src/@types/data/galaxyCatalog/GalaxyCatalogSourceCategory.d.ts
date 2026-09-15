/**
 * Synthetic-fallback categorisation. `survey` sources gate the fallback and
 * fetch through `galaxyCatalogFetcher`; `curated` (Famous) doesn't gate it
 * but shares the same fetcher; `synthetic` (Synthetic itself) is the
 * fallback and fetches through `syntheticPointFetcher`.
 */
export type GalaxyCatalogSourceCategory = 'survey' | 'curated' | 'synthetic';
