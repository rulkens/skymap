/**
 * wireSlots: bootstrap phase 3, core's half of the demand-driven asset
 * orchestrator. Every slot already rides on its composed asset row; this wires the
 * surface tile stream, visibility fades and gates, load progress, the ready-wake,
 * the format-version alert and `reevaluateDemand`, the single place loads start.
 * It does not block on data arrival: `wireInput`/`startLoop` run right after, so
 * the camera and rAF loop come up with whatever has landed. Mutates
 * `deps.allSlots` and `state.subsystems.{loadProgress, surfaceTiles}`.
 */

import { installLoadProgress } from '../wiring/installLoadProgress';
import { installSlotReadyWake } from '../wiring/installSlotReadyWake';
import { installFormatVersionAlert } from '../wiring/installFormatVersionAlert';
import { createSurfaceTileStream } from '../../../layers/body/subsystems/surfaceTiles/surfaceTileStream';
import { IDLE_SURFACE_TILE_PLAN } from '../../../layers/body/subsystems/surfaceTiles/idleSurfaceTilePlan';
import { collectVisibilityGates } from '../wiring/collectVisibilityGates';
import { seedVisibilityFades } from '../wiring/seedVisibilityFades';
import { installVisibilityGates } from '../wiring/installVisibilityGates';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import { loadDataManifest } from '../../loading/dataManifest';
import { engineStatusChanged } from '../../../state/engine/engineSlice';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export async function wireSlots(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { cb } = deps;

  // A subsystem (owns residency and streaming), not a renderer, so it is built
  // here rather than in `initGpu`; free until a plan engages it.
  state.subsystems.surfaceTiles = {
    stream: createSurfaceTileStream({
      device: deps.phaseLocals!.device,
      requestRender: () => state.subsystems.scheduler.requestRender(),
    }),
    plan: IDLE_SURFACE_TILE_PLAN,
  };

  // Seeded at each identity's target (its gating slot's commit), so frame 1 is
  // coherent and a demand-loaded thing waits at 0 to fade in.
  state.visibilityGates = collectVisibilityGates(state);
  seedVisibilityFades(state);

  installLoadProgress(state, deps);

  // After installLoadProgress (allSlots populated), before reevaluateDemand (no
  // slot can reach 'ready' unsubscribed).
  installSlotReadyWake(() => state.subsystems.scheduler.requestRender(), deps.allSlots);

  // Before `reevaluateDemand`, so no gating slot can commit unheard.
  installVisibilityGates(state);

  // Same window: a stale-.bin version mismatch becomes a splash-visible error, not
  // a silent empty sky.
  installFormatVersionAlert(cb.store.dispatch, deps.allSlots);

  cb.store.dispatch(engineStatusChanged({ kind: 'loading' }));

  // Awaited before reevaluateDemand (the only place loads start), so no fetch can
  // race the manifest.
  await loadDataManifest();

  reevaluateDemand(state);
}
