/**
 * packIsmMapFluidStepIndex — the fluid runner's per-step uniform packer:
 * `step` plus the `ismMapFluidEventWindow` active-event index range, so
 * `ismMapFluidStep.wesl`'s texel loop only walks events active THIS step
 * instead of the whole run's event list on every dispatch. `strideBytes` is
 * `device.limits.minUniformBufferOffsetAlignment`, never assume 256, and
 * each step's row leaves the tail of its stride zeroed (unread slack, not a
 * layout requirement past `ismMapFluidStep.wesl`'s own
 * `IsmMapFluidStepIndex`).
 */
import { ismMapFluidEventWindow } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapFluidEvents';
import type { IsmMapFluidEvent } from '../../../../../src/@types/galaxy/IsmMapFluidEvent';

/** Floats actually written per row — `step`, `activeStart`, `activeEnd` — mirrors `ismMapFluidStep.wesl`'s `IsmMapFluidStepIndex`; the row's remaining `strideFloats - 3` floats are unread padding out to the device alignment. */
export const ISM_MAP_FLUID_STEP_INDEX_FLOATS = 3;

export function packIsmMapFluidStepIndex(
  events: readonly IsmMapFluidEvent[],
  steps: number,
  impulseDuration: number,
  strideBytes: number,
): Float32Array {
  const strideFloats = strideBytes / 4;
  const out = new Float32Array(steps * strideFloats);
  for (let s = 0; s < steps; s++) {
    const { start, end } = ismMapFluidEventWindow(events, s, impulseDuration);
    const base = s * strideFloats;
    out[base] = s;
    out[base + 1] = start;
    out[base + 2] = end;
  }
  return out;
}
