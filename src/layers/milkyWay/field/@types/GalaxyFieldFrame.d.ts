import type { IsmMapSeedingLanes } from '../header/@types/IsmMapSeedingLanes';
import type { YoungStarsLanes } from '../header/@types/YoungStarsLanes';
import type { TimingSlotName } from '../../../../@types/gpu/timing/TimingSlotName';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FieldHeaderRenderLanes } from '../header/@types/FieldHeaderRenderLanes';
import type { FieldHeaderFrameLanes } from '../header/@types/FieldHeaderFrameLanes';

/**
 * The per-frame camera/settings lanes the five field headers are packed from
 * — the half of the encode inputs no `GPUTexture` can supply.
 */
export type GalaxyFieldFrame = {
  readonly eye: Vec3;
  readonly fov: number;
  readonly shiftX: number;
  readonly view: FieldHeaderFrameLanes;
  /** `analyticField` gates every pass below, never the header writes. */
  readonly render: FieldHeaderRenderLanes & { readonly analyticField: boolean };
  /** Host-owned because both are derived from the CPU ISM-map readback. */
  readonly ismMapSeeding: IsmMapSeedingLanes;
  readonly youngStars: YoungStarsLanes;
  /**
   * `gpuTimingService.descriptorFor`. Called ONLY where a pass is actually
   * encoded: asking for a descriptor marks its slot consumed, which is what
   * makes a skipped pass's HUD row vanish rather than freeze.
   */
  readonly timestampWrites?: (slot: TimingSlotName) => GPURenderPassTimestampWrites | undefined;
};
