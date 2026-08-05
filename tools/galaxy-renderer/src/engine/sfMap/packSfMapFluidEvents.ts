/**
 * packSfMapFluidEvents — flattens `buildGalaxySfMapFluidEvents`' output into
 * the storage buffer `sfMapFluidStep.wesl` reads. THAT FILE'S `EVENT_STRIDE`
 * (8 floats: az, ring, birthStep, strength, radiusScale, + 3 slack) IS THE
 * LAYOUT AUTHORITY — a stride mismatch ships garbage silently, same as every
 * other sfMap uniform/storage packer in this directory.
 */
import type { SfMapFluidEvent } from '../../../../../src/@types/galaxy/SfMapFluidEvent';

/** Mirrors `EVENT_STRIDE` in `sfMapFluidStep.wesl`. */
export const SF_MAP_FLUID_EVENT_STRIDE = 8;

export function packSfMapFluidEvents(events: readonly SfMapFluidEvent[]): Float32Array {
  const out = new Float32Array(events.length * SF_MAP_FLUID_EVENT_STRIDE);
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const base = i * SF_MAP_FLUID_EVENT_STRIDE;
    out[base] = e.az;
    out[base + 1] = e.ring;
    out[base + 2] = e.birthStep;
    out[base + 3] = e.strength;
    out[base + 4] = e.radiusScale;
    // out[base + 5..7] stay 0 (Float32Array default) — slack, not padding the layout requires.
  }
  return out;
}
