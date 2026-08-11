/**
 * GalaxyEngineHandle — public API for the galaxy renderer engine. Owns the
 * WebGPU device, the generation compute pipelines, the render loop, and all
 * state mutations; consumed by the React bridge/matcher. `setParams` /
 * `setExtras` pack the generation UBO and dispatch the compute passes that
 * fill the GPU vertex buffers; their promises resolve once that work is
 * submitted to the shared queue — no CPU readback, since queue ordering
 * guarantees the buffers are filled before any later frame draws them.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxyIsmMap } from '../../../../src/@types/galaxy/GalaxyIsmMap';
import type { RenderSettings } from './RenderSettings';
import type { LodSettings } from './LodSettings';
import type { ViewPose } from './ViewPose';
import type { ExtraGalaxySpec } from '../../../../src/@types/galaxy/ExtraGalaxySpec';

export type GalaxyEngineHandle = {
  setParams(params: GalaxyParams): Promise<void>; // pack UBO, dispatch generation compute
  setRender(patch: Partial<RenderSettings & LodSettings>): void; // live, no regen
  setFieldTuning(patch: Partial<GalaxyFieldTuning>): void; // live, rebuilds fieldMixture from cached geometry
  setView(pose: Partial<ViewPose>): void;
  setAutoRotate(on: boolean): void;
  setInsets(left: number, right: number): void; // CSS px of overlaid panels
  setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void>; // replace all background galaxies
  step(now?: number): void; // one frame (headless / fit loop)
  sample(): Promise<{ mean: number; max: number; litPct: number; stars: number }>;
  grab(size?: number): Promise<{ S: number; data: Uint8ClampedArray }>; // see createOffscreenProbe
  getCamera(): ViewPose;
  // The ISM-map generator's packed output (gas / stars / activity / dust,
  // log-polar) — see createGalaxyModel.ts's rebuildIsmMap.
  // Consumed by nothing but its own overlay yet; exposed for the sibling UI
  // and future consumers.
  getIsmMapTexture(): GPUTexture;
  // The same output read back to the CPU, once per generation — null until
  // the first readback lands. Feeds the map-seeded placement path in
  // `buildDustParticleCloud` (createGalaxyModel.ts's `scheduleIsmMapReadback`),
  // live whenever `ismMap.generator !== 'none'`.
  getIsmMapData(): GalaxyIsmMap | null;
  // Debug-only: the numeric-readback probe's GPU-vs-CPU check
  // (`probeGpuErrors.ts`) diffs this against `ismMapRingMeans.ts` run over
  // `getIsmMapData()`. No production caller — see
  // `createIsmMapReadbacks.ts`'s `requestRingMeans` for the mechanism.
  requestRingMeansReadback(): Promise<Float32Array>;
  // Debug-only: Task 12's own numeric-validation exception
  // (`createArmRidgeDebugSample.ts`) — armRidge.wesl vs. armRidgeGeometry.ts,
  // read by `probeGpuErrors.ts`'s `readback:armRidgeSample` step. No
  // production caller.
  requestArmRidgeSampleReadback(): Promise<Float32Array>;
  // Debug-only: Task 6's own numeric-validation exception
  // (`createIsmMapDustCdfScanDebugSample.ts`) — ismMapDustCdfScan.wesl's
  // dust-weight prefix sum vs. buildIsmMapDustCdf.ts, read by
  // `probeGpuErrors.ts`'s `readback:ismMapDustCdfScan` step. No production
  // caller yet — Tasks 7/8 wire the real ISM-map texture through it.
  requestIsmMapDustCdfScanReadback(): Promise<{
    readonly grid: {
      readonly rings: number;
      readonly az: number;
      readonly rMin: number;
      readonly rMax: number;
    };
    readonly data: readonly number[];
    readonly prefix: readonly number[];
    // The ring cap this dispatch used (createIsmMapDustCdfScanDebugSample.ts's
    // DEBUG_RING_CAP) — returned rather than re-imported on the probe's
    // Node/tsx side, which cannot resolve that module's `?static` shader import.
    readonly ringCap: number;
  }>;
  // Debug-only: Task 7's own numeric-validation exception
  // (`placeDust.wesl` has no non-GPU path to check its output against) —
  // dispatches fresh and maps the dust slot range straight back, read by
  // `probeGpuErrors.ts`'s `readback:placeDust` step (determinism, budget
  // count, survival-floor zeroing). No production caller. `null` when
  // nothing is reserved this rebuild. `forceGeneratorIsFluid`, when given,
  // overrides the live tuning for THIS dispatch only — see
  // createGalaxyModel.ts's `dustDispatchInput` for why the probe uses this
  // (instead of flipping `ismMap.generator` through `setFieldTuning`) to
  // exercise placeDust.wesl's mode-1 (smoothDisc) branch.
  requestDustPlacementReadback(opts?: { readonly forceGeneratorIsFluid?: boolean }): Promise<{
    readonly count: number;
    readonly records: Float32Array;
  } | null>;
  // Debug-only: Task 14's own numeric-validation exception
  // (`placeArmSpurCloud.wesl` has no non-GPU path to check its output
  // against) — dispatches fresh and maps the spur-cloud reservation's slot
  // range straight back, read by `probeGpuErrors.ts`'s
  // `readback:placeArmSpurCloud` step (determinism, budget count, survival/
  // liveness). No production caller. `null` when nothing is reserved this
  // rebuild (central galaxy only — see `createGalaxyModel.ts`'s
  // `spurCloudReservation`).
  requestArmSpurCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  dispose(): void;
};
