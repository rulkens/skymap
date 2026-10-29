/**
 * create — the satellites Layer in dependency order: the renderers, the propagator (no worker yet),
 * then the slot that drives it, then the selected
 * satellites the camera may follow. A landed sweep wakes the frame loop so it is drawn even with
 * the camera at rest.
 */
import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { SatellitesRuntime } from './@types/SatellitesRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { SATELLITE_SWEEP_TIMING } from '../../data/satellites/satelliteSweepTiming';
import { createSatellitePointRenderer } from './render/satellitePointRenderer';
import { createOrbitTrailRenderer } from '../../services/gpu/renderers/bodies/orbitTrailRenderer';
import { createSatellitePropagator } from './subsystems/createSatellitePropagator';
import { createSatellitesSlot } from './load/satellitesSlot';
import { createSelectedSatellites } from './subsystems/createSelectedSatellites';
import SatellitePropagationWorker from './load/satellitePropagation.worker?worker';

export function create(deps: LayerCoreDeps): SatellitesRuntime {
  const renderer = createSatellitePointRenderer({
    device: deps.ctx.device,
    targetFormat: HDR_TARGET_FORMAT,
  });
  const orbitRenderer = createOrbitTrailRenderer(deps.ctx.device, HDR_TARGET_FORMAT);
  const propagator = createSatellitePropagator(SatellitePropagationWorker, deps.requestRender);
  let wake: ReturnType<typeof setTimeout> | null = null;
  const cancelWake = (): void => {
    if (wake !== null) clearTimeout(wake);
    wake = null;
  };
  const slot = createSatellitesSlot(propagator, renderer);
  return {
    renderer,
    orbitRenderer,
    propagator,
    slot,
    selected: createSelectedSatellites(
      { read: () => deps.store.getState().selection, subscribe: deps.store.subscribe },
      { slot, propagator },
    ),
    scheduleWake: () => {
      cancelWake();
      wake = setTimeout(() => {
        wake = null;
        deps.requestRender();
      }, SATELLITE_SWEEP_TIMING.realIntervalMs);
    },
    cancelWake,
  };
}
