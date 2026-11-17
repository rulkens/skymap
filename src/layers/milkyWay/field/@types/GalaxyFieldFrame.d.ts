import type { FieldHostTuning } from '../host/@types/FieldHostTuning';
import type { YoungStarsLanes } from '../header/@types/YoungStarsLanes';
import type { FieldTargetId } from './FieldTargetId';
import type { FieldView } from './FieldView';
import type { FieldHeaderFrameLanes } from '../header/@types/FieldHeaderFrameLanes';

/**
 * The per-frame camera/settings lanes the five field headers are packed from
 * — the half of the encode inputs no `GPUTexture` can supply.
 */
export type GalaxyFieldFrame = {
  readonly camera: FieldView;
  readonly view: FieldHeaderFrameLanes;
  readonly render: FieldHostTuning['render'];
  /** Its `invMeanNorm` is derived by the host from the CPU ISM-map readback. */
  readonly youngStars: YoungStarsLanes;
  /**
   * Timestamps by target. Called ONLY where a pass is actually encoded: asking
   * for a descriptor marks its slot consumed, which is what makes a skipped
   * pass's HUD row vanish rather than freeze.
   */
  readonly timestampWrites?: (id: FieldTargetId) => GPURenderPassTimestampWrites | undefined;
};
