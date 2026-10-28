/**
 * The satellites Layer's whole runtime. The propagator holds no worker until the slot commits and
 * none after it releases (spec §5.5); the renderer and the slot live as long as the Layer.
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
