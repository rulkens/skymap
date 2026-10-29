/**
 * The satellites Layer's whole runtime: the propagator, the dot renderer, the orbit-ring renderer
 * (its own instance, not core's), the catalog slot and the selected satellites.
 */
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { OrbitTrailRenderer } from '../../../@types/rendering/orbitTrailRenderer/OrbitTrailRenderer';
import type { SatellitePointRenderer } from './SatellitePointRenderer';
import type { SatellitePropagator } from './SatellitePropagator';
import type { SelectedSatellites } from './SelectedSatellites';
import type { SimRateTracker } from './SimRateTracker';

export type SatellitesRuntime = {
  readonly renderer: SatellitePointRenderer;
  readonly orbitRenderer: OrbitTrailRenderer;
  readonly propagator: SatellitePropagator;
  readonly slot: AssetSlot<ArrayBuffer, void>;
  readonly selected: SelectedSatellites;
  readonly simRate: SimRateTracker;
  /** Wakes the frame loop `SATELLITE_SWEEP_TIMING.realIntervalMs` from now (replacing a pending wake). */
  readonly scheduleWake: () => void;
  readonly cancelWake: () => void;
};
