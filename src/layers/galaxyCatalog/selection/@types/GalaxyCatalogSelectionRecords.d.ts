import type { GalaxyCatalogRuntime } from '../../@types/GalaxyCatalogRuntime';

/** The live reads `galaxyCatalogSelectionRow` makes; the runtime satisfies it. */
export type GalaxyCatalogSelectionRecords = Pick<
  GalaxyCatalogRuntime,
  'records' | 'recordBridge' | 'pickCodes'
>;
