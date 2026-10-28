import type { SatelliteClass } from '../../@types/satellites/SatelliteClass';

/** Index = the class byte in `satellites.bin`; append only, or every published file misreads. */
export const SATELLITE_CLASSES: readonly SatelliteClass[] = ['active', 'debris', 'other'];
