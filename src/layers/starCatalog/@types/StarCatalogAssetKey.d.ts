import type { StarCatalogSourceType } from './StarCatalogSourceType';

/** The asset rows this Layer authors: one per streamed survey catalog, and the famous-star sidecar. */
export type StarCatalogAssetKey = StarCatalogSourceType | 'famousStarsMeta';
