import type { GalaxyInfo } from '../../records/@types/GalaxyInfo';
import type { GalaxyCatalogRef } from './GalaxyCatalogRef';

export type GalaxyCatalogTarget = GalaxyInfo & { readonly ref: GalaxyCatalogRef };
