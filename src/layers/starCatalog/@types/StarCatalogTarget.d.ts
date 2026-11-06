import type { StarInfo } from './StarInfo';
import type { StarCatalogRef } from './StarCatalogRef';

export type StarCatalogTarget = StarInfo & { readonly ref: StarCatalogRef };
