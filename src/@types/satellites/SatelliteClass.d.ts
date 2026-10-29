/**
 * SatelliteClass — the Settings toggle a satellite belongs to. `gp.bin` stores it as its index in
 * `SATELLITE_CLASSES`, so the order there is part of the file format.
 */
export type SatelliteClass = 'active' | 'debris' | 'other';
