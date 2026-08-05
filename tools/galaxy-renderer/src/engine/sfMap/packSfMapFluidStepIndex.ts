/**
 * packSfMapFluidStepIndex — the fluid runner's OWN per-step uniform packer,
 * parallel to the shared `sfMapStepIndexData.ts` (still used unmodified by
 * the automaton runner and the percolation harness) but carrying two extra
 * floats per step: the `sfMapFluidEventWindow` active-event index range,
 * so `sfMapFluidStep.wesl`'s texel loop only walks events active THIS step
 * instead of the whole run's event list on every dispatch (the fix for the
 * O(steps^2 * texels) rebuild cost — see `createSfMapFluidRunner.ts`'s
 * `rebuild` docblock). A fluid-only copy, not a generalization of the shared
 * packer: the automaton has no event buffer to window, and changing the
 * shared packer's shape would ship a dead pair of floats to every automaton
 * dispatch for no benefit.
 *
 * Same alignment contract as `sfMapStepIndexData.ts`: `strideBytes` is
 * `device.limits.minUniformBufferOffsetAlignment`, never assume 256, and
 * each step's row leaves the tail of its stride zeroed (unread slack, not a
 * layout requirement past `sfMapFluidStep.wesl`'s own `SfMapFluidStepIndex`).
 */
import { sfMapFluidEventWindow } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapFluidEvents';
import type { SfMapFluidEvent } from '../../../../../src/@types/galaxy/SfMapFluidEvent';

/** Floats actually written per row — `step`, `activeStart`, `activeEnd` — mirrors `sfMapFluidStep.wesl`'s `SfMapFluidStepIndex`; the row's remaining `strideFloats - 3` floats are unread padding out to the device alignment. */
export const SF_MAP_FLUID_STEP_INDEX_FLOATS = 3;

export function packSfMapFluidStepIndex(
  events: readonly SfMapFluidEvent[],
  steps: number,
  impulseDuration: number,
  strideBytes: number,
): Float32Array {
  const strideFloats = strideBytes / 4;
  const out = new Float32Array(steps * strideFloats);
  for (let s = 0; s < steps; s++) {
    const { start, end } = sfMapFluidEventWindow(events, s, impulseDuration);
    const base = s * strideFloats;
    out[base] = s;
    out[base + 1] = start;
    out[base + 2] = end;
  }
  return out;
}
