/**
 * packSfMapFluidEvents — the one thing that could actually break here is an
 * off-by-one in the per-event stride, which would silently shift every field
 * after the first for every event past the first. A round-trip over two
 * events pins that.
 */
import { describe, expect, it } from 'vitest';
import {
  packSfMapFluidEvents,
  SF_MAP_FLUID_EVENT_STRIDE,
} from '../../../../../tools/galaxy-renderer/src/engine/sfMap/packSfMapFluidEvents';
import type { SfMapFluidEvent } from '../../../../../src/@types/galaxy/SfMapFluidEvent';

describe('packSfMapFluidEvents', () => {
  it('packs each event at its own EVENT_STRIDE-aligned offset, in field order', () => {
    // Exactly representable in f32 (halves and quarters), so the Float32Array
    // round-trip can't fail on rounding — this test is about offsets, not precision.
    const events: SfMapFluidEvent[] = [
      { az: 10, ring: 20, birthStep: 3, strength: 1.5, radiusScale: 2.5 },
      { az: 11, ring: 21, birthStep: 4, strength: 1.75, radiusScale: 2.25 },
    ];
    const packed = packSfMapFluidEvents(events);

    expect(packed.length).toBe(events.length * SF_MAP_FLUID_EVENT_STRIDE);
    for (let i = 0; i < events.length; i++) {
      const base = i * SF_MAP_FLUID_EVENT_STRIDE;
      expect(packed[base]).toBe(events[i]!.az);
      expect(packed[base + 1]).toBe(events[i]!.ring);
      expect(packed[base + 2]).toBe(events[i]!.birthStep);
      expect(packed[base + 3]).toBe(events[i]!.strength);
      expect(packed[base + 4]).toBe(events[i]!.radiusScale);
      for (let pad = 5; pad < SF_MAP_FLUID_EVENT_STRIDE; pad++) {
        expect(packed[base + pad]).toBe(0);
      }
    }
  });

  it('packs zero events into an empty buffer', () => {
    expect(packSfMapFluidEvents([]).length).toBe(0);
  });
});
