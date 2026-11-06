import type { GalaxyInfo } from '../../../../@types/engine/GalaxyInfo';
import type { GalaxyCatalogRef } from './GalaxyCatalogRef';

export type GalaxyCatalogTarget = GalaxyInfo & { readonly ref: GalaxyCatalogRef };
