/**
 * packIsmMapFluidEvents — flattens `buildGalaxyIsmMapFluidEvents`' output into
 * the storage buffer `ismMapFluidStep.wesl` reads. THAT FILE'S `EVENT_STRIDE`
 * (8 floats: az, ring, birthStep, strength, radiusScale, + 3 slack) IS THE
 * LAYOUT AUTHORITY — a stride mismatch ships garbage silently, same as every
 * other ismMap uniform/storage packer in this directory.
 */
import type { IsmMapFluidEvent } from '../../../../../src/@types/galaxy/IsmMapFluidEvent';

/** Mirrors `EVENT_STRIDE` in `ismMapFluidStep.wesl`. */
export const ISM_MAP_FLUID_EVENT_STRIDE = 8;

export function packIsmMapFluidEvents(events: readonly IsmMapFluidEvent[]): Float32Array {
  const out = new Float32Array(events.length * ISM_MAP_FLUID_EVENT_STRIDE);
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const base = i * ISM_MAP_FLUID_EVENT_STRIDE;
    out[base] = e.az;
    out[base + 1] = e.ring;
    out[base + 2] = e.birthStep;
    out[base + 3] = e.strength;
    out[base + 4] = e.radiusScale;
    // out[base + 5..7] stay 0 (Float32Array default) — slack, not padding the layout requires.
  }
  return out;
}
