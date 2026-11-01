import type { SourceEntryBase } from '../SourceEntryBase';

/** SatelliteSourceEntry — the satellites Layer's one registry row: its pick code and its names. */
export type SatelliteSourceEntry = SourceEntryBase & {
  readonly type: 'satellite';
  /** Stable numeric tag; not persisted, packed into the pick texture. */
  readonly code: number;
};
