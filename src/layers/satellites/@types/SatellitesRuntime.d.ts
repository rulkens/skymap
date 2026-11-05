/**
 * The satellites Layer's whole runtime: the propagator, the dot renderer, the orbit-ring renderer
 * (its own instance, not core's) and the catalog slot.
 */
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { OrbitTrailRenderer } from '../../../@types/rendering/orbitTrailRenderer/OrbitTrailRenderer';
import type { SatellitePointRenderer } from '../points/@types/SatellitePointRenderer';
import type { SatellitePropagator } from '../sweep/@types/SatellitePropagator';
import type { SimRateTracker } from '../sweep/@types/SimRateTracker';

export type SatellitesRuntime = {
  readonly renderer: SatellitePointRenderer;
  readonly orbitRenderer: OrbitTrailRenderer;
  readonly propagator: SatellitePropagator;
  readonly slot: AssetSlot<ArrayBuffer, void>;
  readonly simRate: SimRateTracker;
  /** The Layer's pick code; the dot stamp and the selection row both pack it. */
  readonly pickCode: number;
  /** Wakes the frame loop `SATELLITE_SWEEP_TIMING.realIntervalMs` from now (replacing a pending wake). */
  readonly scheduleWake: () => void;
  readonly cancelWake: () => void;
};
