import type { SatelliteClass } from '../../@types/satellites/SatelliteClass';

/** Index = the class byte in `satellites.satg`; append only, or every published file misreads. */
export const SATELLITE_CLASSES = ['active', 'debris', 'other'] as const satisfies readonly SatelliteClass[];
