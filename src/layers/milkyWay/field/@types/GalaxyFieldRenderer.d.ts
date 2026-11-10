import type { DustHeaderLanes } from '../dust/@types/DustHeaderLanes';
import type { FieldFramePlan } from './FieldFramePlan';
import type { FieldSliceCounts } from './FieldSliceCounts';
import type { GalaxyFieldMixtureResult } from '../mixture/@types/GalaxyFieldMixtureResult';
import type { HiiSegment } from '../starFormation/@types/HiiSegment';
import type { IsmMapGenerator } from '../ismMap/@types/IsmMapGenerator';
import type { IsmMapOrientation } from '../ismMap/@types/IsmMapOrientation';
import type { GalaxyFieldMixtureInput } from '../mixture/@types/GalaxyFieldMixtureInput';
import type { GalaxyFieldRenderTargets } from './GalaxyFieldRenderTargets';
import type { GalaxyFieldFrame } from './GalaxyFieldFrame';
import type { GalaxyFieldOverlays } from './GalaxyFieldOverlays';
import type { GalaxyFieldProbe } from '../probe/@types/GalaxyFieldProbe';

export type GalaxyFieldRenderer = {
  /**
   * Rebuild whatever the moved half of `input` feeds. Idempotent: a call in
   * which nothing moved (the host passes its whole tuning every frame, each section identity-keyed)
   * does no work.
   */
  setMixture(input: GalaxyFieldMixtureInput): void;
  /**
   * Run the deferred GPU rebuilds in their own dependency order. The host
   * must call this BEFORE the frame's encoder exists — the orientation chain
   * submits an encoder of its own that has to precede the frame's. `done` is
   * always true today; the seam exists so a future per-galaxy scheduler can
   * spread the same calls across frames with no API change.
   */
  stepIsmMap(): { readonly done: boolean };
  /**
   * Pack this frame's five headers, then encode exactly `plan.encodes`, in
   * its order, into the caller's encoder (plus the debug dust view, iff
   * `targets.dustView` is present and its weight is above 0). Where the passes
   * sit in the frame is the host's call.
   */
  encode(
    encoder: GPUCommandEncoder,
    plan: FieldFramePlan,
    targets: GalaxyFieldRenderTargets,
    frame: GalaxyFieldFrame,
  ): void;
  /** The three present overlays, into the host's already-open scene pass. */
  encodeOverlays(pass: GPURenderPassEncoder, overlays: GalaxyFieldOverlays): void;

  readonly fieldCounts: FieldSliceCounts;
  readonly dustHeaderLanes: DustHeaderLanes;
  /** `hiiComps`' buffer-wide segmentation — `planFieldFrame` reads it. */
  readonly hiiSegments: readonly HiiSegment[];
  readonly armCloudReservation: GalaxyFieldMixtureResult['armCloudReservation'];
  readonly spurCloudReservation: GalaxyFieldMixtureResult['spurCloudReservation'];
  /**
   * Exposed for the host's CPU readback path alone (`createIsmMapReadbacks`
   * and the ISM-map debug view), which stays host-side per the spec.
   */
  readonly ismMapGenerator: IsmMapGenerator;
  readonly ismMapOrientation: IsmMapOrientation;
  readonly probe: GalaxyFieldProbe;
  dispose(): void;
};
