/**
 * timestampSpread — one timing slot as a SPREADABLE fragment of a pass
 * descriptor: `{...timestampSpread(timing, slot)}` attaches `timestampWrites`
 * when the service hands one over and contributes nothing when it does not.
 *
 * `timestampWrites: undefined` is not the same as the key being absent — the
 * key with an undefined value is a validation error in some implementations —
 * so the spread, not a ternary on the field, is the idiom throughout the frame.
 *
 * Render and compute both go through here: `descriptorFor` returns the render
 * shape and the two descriptor types are structurally identical, so a compute
 * pass spreads the same object.
 */

import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { TimingSlotName } from '../../@types/gpu/timing/TimingSlotName';

export function timestampSpread(
  timing: GpuTimingService,
  slot: TimingSlotName,
): { timestampWrites?: GPURenderPassTimestampWrites } {
  const descriptor = timing.descriptorFor(slot);
  return descriptor === undefined ? {} : { timestampWrites: descriptor };
}
