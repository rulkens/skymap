import type { StarCatalogId } from './StarCatalogId';

/** The asset rows this Layer authors: one per streamed survey catalog, and the famous-star sidecar. */
export type StarCatalogAssetKey = StarCatalogId | 'famousStarsMeta';
