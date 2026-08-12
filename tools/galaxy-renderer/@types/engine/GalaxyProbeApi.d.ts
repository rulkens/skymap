/**
 * GalaxyProbeApi — every debug/validation entry point `probeGpuErrors.ts`
 * reaches; no production caller touches `handle.probe`, so that separation
 * is structural rather than per-method comments. `createGalaxyModel.ts`
 * builds the model-level members (`peekRecords`, the four placement
 * readbacks, the live counts/reservations `peekRecords`' caller derives its
 * own offset/count from); `createGalaxyEngine.ts` spreads in the
 * device/texture-bound readbacks (arm-ridge sample, ISM-map dust-CDF-scan
 * sample, the rendered-flux sums) that can't live inside the model.
 */

import type { FieldSliceCounts } from './FieldSliceCounts';
import type { HiiSegment } from './HiiSegment';
import type { GalaxyFieldMixtureResult } from '../../../../src/@types/galaxy/GalaxyFieldMixtureResult';

export type GalaxyProbeApi = {
  // Live production state — NOT copies — that `peekRecords`' caller reads to
  // derive its own (offset, count): `fieldCounts.emission`/`.dust` locate
  // the dust tail, `armCloudReservation`/`spurCloudReservation` locate
  // theirs, and `hiiSegments`'s `'hii:dig'` entry locates the DIG veil's.
  readonly fieldCounts: FieldSliceCounts;
  readonly hiiSegments: readonly HiiSegment[];
  readonly armCloudReservation: GalaxyFieldMixtureResult['armCloudReservation'];
  readonly spurCloudReservation: GalaxyFieldMixtureResult['spurCloudReservation'];

  /**
   * Copies `[offset, offset+count)` straight off the LIVE `fieldComps`/
   * `hiiComps` buffer, without dispatching anything — the ONE generic
   * replacement for the four old `request<Tier>BufferPeek` clones. This is
   * NOT redundant with the readbacks below: a readback re-dispatches its
   * kernel fresh (validates the kernel itself — determinism, budget,
   * survival floor, flux parity), while a peek validates that
   * `ensureFresh()`'s keyed rebuilds actually refilled the slots the last
   * repack zeroed — a bug class a fresh dispatch cannot see (Task 14's
   * vanish bug). Both reads must keep working.
   */
  peekRecords(buffer: 'field' | 'hii', offset: number, count: number): Promise<Float32Array>;

  // Debug-only: diffs `ismMapRingReduce.wesl`'s GPU ring means against
  // `ismMapRingMeans.ts`'s CPU loop over `getIsmMapData()`. No production
  // caller.
  requestRingMeansReadback(): Promise<Float32Array>;
  // Debug-only: Task 12's own numeric-validation exception
  // (`createArmRidgeDebugSample.ts`) — armRidge.wesl vs. armRidgeGeometry.ts.
  // No production caller.
  requestArmRidgeSampleReadback(): Promise<Float32Array>;
  // Debug-only: Task 6's own numeric-validation exception
  // (`createIsmMapDustCdfScanDebugSample.ts`) — ismMapDustCdfScan.wesl's
  // dust-weight prefix sum vs. buildIsmMapDustCdf.ts. No production caller.
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
  // Debug-only: Task 7's own numeric-validation exception — dispatches
  // `placeDust.wesl` fresh and maps the dust slot range straight back
  // (determinism, budget count, survival-floor zeroing). `null` when nothing
  // is reserved this rebuild. `forceGeneratorIsFluid`, when given, overrides
  // the live tuning for THIS dispatch only — see createGalaxyModel.ts's
  // `dustDispatchInput` for why (exercises placeDust.wesl's mode-1
  // (smoothDisc) branch without flipping the live tuning).
  requestDustPlacementReadback(opts?: { readonly forceGeneratorIsFluid?: boolean }): Promise<{
    readonly count: number;
    readonly records: Float32Array;
    readonly mass: Float32Array;
    readonly renormScale: number;
  } | null>;
  // Debug-only: sums every rgba16float channel of the WHOLE `dustMapTex`
  // back to one scalar, so the probe can observe `dustMap/fragment.wesl`'s
  // ACTUAL rendered output responding to a `dustRenormBuffer` change, not
  // just the buffer both the compute kernel and a direct readback share. See
  // `readTextureChannelSum.ts`'s own doc for why the sum is exactly linear
  // in the renorm scale. No production caller.
  requestDustMapChannelSum(): Promise<number>;
  // Debug-only: draws ONLY the arm-cloud reservation's own instance range
  // into `targets.fieldTex` (via `encodeSplatPass`'s `firstInstance`)
  // through the REAL production pipeline/bind group, isolated from every
  // other component. `null` when nothing is reserved this rebuild. No
  // production caller.
  requestArmCloudRenderedFluxSum(): Promise<number | null>;
  // Debug-only: the spur-cloud twin of `requestArmCloudRenderedFluxSum`.
  requestArmSpurCloudRenderedFluxSum(): Promise<number | null>;
  // Debug-only: Task 14's own numeric-validation exception — dispatches
  // fresh and maps the spur-cloud reservation's slot range straight back
  // (determinism, budget, survival/liveness, flux parity against `flux` —
  // the SAME `spurFlux` uniform the dispatch used). `fluxWeight`/
  // `renormScale` (Task 15) are the flux-weight-sum input and the
  // GPU-computed reciprocal renorm scale off a dispatch encoded against the
  // SAME `fluxWeight`. `null` when nothing is reserved this rebuild
  // (central galaxy only). No production caller.
  requestArmSpurCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly flux: number;
    readonly records: Float32Array;
    readonly fluxWeight: Float32Array;
    readonly renormScale: number;
  } | null>;
  // Debug-only: the arm-cloud twin of `requestArmSpurCloudPlacementReadback`.
  requestArmCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly flux: number;
    readonly records: Float32Array;
    readonly fluxWeight: Float32Array;
    readonly renormScale: number;
  } | null>;
  // Debug-only: Task 8's own numeric-validation exception — dispatches
  // fresh and maps the DIG veil reservation's slot range straight back
  // (determinism, budget, liveness, flux parity). `amplitudeBase` is the
  // SAME uniform the dispatch used. `null` when nothing is reserved this
  // rebuild (central galaxy only). No production caller.
  requestDigVeilPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly amplitudeBase: number;
    readonly records: Float32Array;
  } | null>;
};
