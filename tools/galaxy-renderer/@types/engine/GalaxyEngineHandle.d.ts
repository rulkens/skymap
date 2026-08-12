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
  // `mass`/`renormScale` are Task 9's own additions — see
  // createGalaxyModel.ts's `requestDustPlacementReadback` for what each
  // reads back.
  requestDustPlacementReadback(opts?: { readonly forceGeneratorIsFluid?: boolean }): Promise<{
    readonly count: number;
    readonly records: Float32Array;
    readonly mass: Float32Array;
    readonly renormScale: number;
  } | null>;
  // Debug-only: Task 14 fix round 2's own dust-twin regression exception —
  // COPIES the dust tail's CURRENT slot range out of the LIVE `fieldComps`
  // buffer, without dispatching `placeDust.wesl` first (the readback above
  // always re-dispatches fresh and so cannot observe whether the PRODUCTION
  // `ensureFresh()` path actually kept the buffer filled). Read by
  // `probeGpuErrors.ts`'s own "survives an arms-only tuning change"
  // assertion. No production caller.
  requestDustBufferPeek(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  // Debug-only: Task 9 fix round 1 — sums every rgba16float channel of the
  // WHOLE `dustMapTex` back to one scalar, so the probe can observe
  // `dustMap/fragment.wesl`'s ACTUAL rendered output responding to a
  // `dustRenormBuffer` change, not just the buffer both the compute kernel
  // and a direct readback share. See `readTextureChannelSum.ts`'s own doc
  // for why the sum is exactly linear in the renorm scale. No production
  // caller.
  requestDustMapChannelSum(): Promise<number>;
  // Debug-only: Task 15's own consuming-multiply exception — the arm-cloud/
  // spur-cloud twin of `requestDustMapChannelSum` above, against
  // `targets.fieldTex` (the shared target every emission component draws
  // into). No production caller.
  requestFieldTexChannelSum(): Promise<number>;
  // Debug-only: Task 15's own consuming-multiply exception, take 2 — draws
  // ONLY the arm-cloud/spur-cloud reservation's own instance range into
  // `targets.fieldTex` (via `encodeSplatPass`'s `firstInstance`) through the
  // REAL production pipeline/bind group, isolated from every other
  // component. `null` when nothing is reserved this rebuild. No production
  // caller.
  requestArmCloudRenderedFluxSum(): Promise<number | null>;
  requestArmSpurCloudRenderedFluxSum(): Promise<number | null>;
  // Debug-only: Task 14's own numeric-validation exception
  // (`placeArmSpurCloud.wesl` has no non-GPU path to check its output
  // against) — dispatches fresh and maps the spur-cloud reservation's slot
  // range straight back, read by `probeGpuErrors.ts`'s
  // `readback:placeArmSpurCloud` step (determinism, budget count, survival/
  // liveness, and flux parity against `flux` — the SAME `spurFlux` uniform
  // the dispatch used). No production caller. `null` when nothing is
  // reserved this rebuild (central galaxy only — see `createGalaxyModel.ts`'s
  // `spurCloudReservation`).
  // `fluxWeight`/`renormScale` (Task 15) — the flux-weight-sum input and the
  // GPU-computed reciprocal renorm scale off a dispatch encoded against the
  // SAME `fluxWeight`, read by `readback:placeArmSpurCloud`'s own weightSum
  // GPU-vs-CPU assertion.
  requestArmSpurCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly flux: number;
    readonly records: Float32Array;
    readonly fluxWeight: Float32Array;
    readonly renormScale: number;
  } | null>;
  // Debug-only: Task 14 fix round 1's own regression exception — COPIES the
  // reservation's CURRENT slot range out of the LIVE `fieldComps` buffer,
  // without dispatching `placeArmSpurCloud.wesl` first (unlike the readback
  // above, which always re-dispatches fresh and so cannot observe whether
  // the PRODUCTION `ensureFresh()` path actually kept the buffer filled).
  // Read by `probeGpuErrors.ts`'s `readback:placeArmSpurCloud` step's own
  // "survives a dust-only tuning change" assertion. No production caller.
  requestArmSpurCloudBufferPeek(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  // Debug-only: Task 13's own numeric-validation exception
  // (`placeArmCloud.wesl` has no non-GPU path to check its output against)
  // — dispatches fresh and maps the arm-cloud reservation's slot range
  // straight back, read by `probeGpuErrors.ts`'s `readback:placeArmCloud`
  // step (determinism, budget count, flux parity). No production caller.
  // `null` when nothing is reserved this rebuild (central galaxy only — see
  // `createGalaxyModel.ts`'s `armCloudReservation`).
  // `fluxWeight`/`renormScale` (Task 15) — the arm-cloud twin of
  // `requestArmSpurCloudPlacementReadback`'s own two fields above.
  requestArmCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly flux: number;
    readonly records: Float32Array;
    readonly fluxWeight: Float32Array;
    readonly renormScale: number;
  } | null>;
  // Debug-only: the arm-cloud twin of `requestArmSpurCloudBufferPeek` —
  // COPIES the reservation's CURRENT slot range out of the LIVE `fieldComps`
  // buffer, without dispatching `placeArmCloud.wesl` first. Read by
  // `probeGpuErrors.ts`'s `readback:placeArmCloud` step's own "survives a
  // dust-only tuning change" assertion. No production caller.
  requestArmCloudBufferPeek(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  // Debug-only: Task 8's own numeric-validation exception
  // (`placeDigVeil.wesl` has no non-GPU path to check its output against)
  // — dispatches fresh and maps the DIG veil reservation's slot range
  // straight back, read by `probeGpuErrors.ts`'s `readback:placeDigVeil`
  // step (determinism, budget count, liveness, flux parity). No production
  // caller. `null` when nothing is reserved this rebuild (central galaxy
  // only — see `createGalaxyModel.ts`'s `digBudget`).
  requestDigVeilPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly amplitudeBase: number;
    readonly records: Float32Array;
  } | null>;
  // Debug-only: the DIG twin of `requestArmCloudBufferPeek` — COPIES the
  // reservation's CURRENT slot range out of the LIVE `hiiComps` buffer,
  // without dispatching `placeDigVeil.wesl` first. Read by
  // `probeGpuErrors.ts`'s `readback:placeDigVeil` step's own "survives an
  // unrelated tuning change" assertion. No production caller.
  requestDigVeilBufferPeek(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  dispose(): void;
};
