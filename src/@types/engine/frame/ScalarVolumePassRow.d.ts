/**
 * ScalarVolumePassRow — per-subsystem input to `createScalarVolumePass`: the
 * fields today's scalar-volume raymarch varies on (name, which offscreen it
 * draws into, its renderer instance, the shared liveness gate). Twin of
 * `UpsamplePassRow`, one stage earlier in the producer/consumer pair.
 */

import type { VolumeFieldRenderer } from '../../rendering/VolumeFieldRenderer';
import type { VolumeFieldLiveness } from '../../rendering/VolumeFieldLiveness';
import type { PassState } from './PassState';
import type { FrameView } from './FrameView';

export type ScalarVolumePassRow<Id extends string> = {
  /** Stable identifier, forwarded verbatim to the produced `ContentPass.name`. */
  readonly name: string;
  /** `RenderTargetSpec.id` this raymarch draws into; its `sizeOf` is the viewport. */
  readonly targetId: string;
  readonly renderer: VolumeFieldRenderer<Id>;
  /** Shared with the upsample row's `enabled`; `null` = nothing live. */
  liveness(state: PassState, ctx: FrameView): VolumeFieldLiveness<Id> | null;
};
