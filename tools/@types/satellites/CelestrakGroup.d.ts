import type { SatelliteClass } from '../../../src/@types/satellites/SatelliteClass';

/** CelestrakGroup — one `GROUP=` download and the class its objects get when nothing earlier claims them. */
export type CelestrakGroup = {
  readonly group: string;
  /** `'by-name'`: the group mixes kinds, so the name decides (`DEB` → debris, else other). */
  readonly class: SatelliteClass | 'by-name';
};
