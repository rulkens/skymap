import type { SatelliteInfo } from './SatelliteInfo';
import type { SatelliteRef } from './SatelliteRef';

export type SatelliteTarget = SatelliteInfo & { readonly ref: SatelliteRef };
