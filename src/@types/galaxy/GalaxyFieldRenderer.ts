import type { DustHeaderLanes } from './DustHeaderLanes';
import type { FieldSliceCounts } from './FieldSliceCounts';
import type { GalaxyFieldMixtureResult } from './GalaxyFieldMixtureResult';
import type { HiiSegment } from './HiiSegment';
import type { IsmMapGenerator } from '../../services/gpu/renderers/galaxyField/ismMap/createIsmMapGenerator';
import type { IsmMapOrientation } from '../../services/gpu/renderers/galaxyField/ismMap/createIsmMapOrientation';
import type { GalaxyFieldMixtureInput } from './GalaxyFieldMixtureInput';
import type { GalaxyFieldRenderTargets } from './GalaxyFieldRenderTargets';
import type { GalaxyFieldFrame } from './GalaxyFieldFrame';
import type { GalaxyFieldOverlays } from './GalaxyFieldOverlays';
import type { GalaxyFieldProbe } from './GalaxyFieldProbe';

export type GalaxyFieldRenderer = {
  /**
   * Rebuild whatever the moved half of `input` feeds. Idempotent: a call in
   * which nothing moved (the host re-pushes its whole render bag on any knob)
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
   * Pack this frame's five headers, then encode the dust-map, dust-present,
   * field-splat and HII-tier passes into the caller's encoder. The only
   * ordering owned here is what is intrinsic to one galaxy's own passes
   * (dustMap before field); where they sit in the frame is the host's call.
   */
  encode(
    encoder: GPUCommandEncoder,
    targets: GalaxyFieldRenderTargets,
    frame: GalaxyFieldFrame,
  ): void;
  /** The three present overlays, into the host's already-open scene pass. */
  encodeOverlays(pass: GPURenderPassEncoder, overlays: GalaxyFieldOverlays): void;

  readonly fieldCounts: FieldSliceCounts;
  readonly dustHeaderLanes: DustHeaderLanes;
  /** `hiiComps`' buffer-wide segmentation — the host's composite gates read it. */
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
