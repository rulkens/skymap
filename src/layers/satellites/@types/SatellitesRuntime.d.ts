/**
 * The satellites Layer's whole runtime: the propagator, the renderer, the catalog slot and the
 * selected satellites.
 */
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { SatellitePointRenderer } from './SatellitePointRenderer';
import type { SatellitePropagator } from './SatellitePropagator';
import type { SelectedSatellites } from './SelectedSatellites';

export type SatellitesRuntime = {
  readonly renderer: SatellitePointRenderer;
  readonly propagator: SatellitePropagator;
  readonly slot: AssetSlot<ArrayBuffer, void>;
  readonly selected: SelectedSatellites;
  /** Wakes the frame loop `SATELLITE_SWEEP_TIMING.realIntervalMs` from now (replacing a pending wake). */
  readonly scheduleWake: () => void;
  readonly cancelWake: () => void;
};
