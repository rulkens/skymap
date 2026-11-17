import type { StarInfo } from '../../@types/StarInfo';
import type { StarCatalogRef } from './StarCatalogRef';

export type StarCatalogTarget = StarInfo & { readonly ref: StarCatalogRef };
