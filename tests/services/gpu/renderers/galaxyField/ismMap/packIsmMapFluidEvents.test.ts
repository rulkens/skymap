/**
 * packIsmMapFluidEvents — the one thing that could actually break here is an
 * off-by-one in the per-event stride, which would silently shift every field
 * after the first for every event past the first. A round-trip over two
 * events pins that.
 */
import { describe, expect, it } from 'vitest';
import {
  packIsmMapFluidEvents,
  ISM_MAP_FLUID_EVENT_STRIDE,
} from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packIsmMapFluidEvents';
import type { IsmMapFluidEvent } from '../../../../../../src/@types/galaxy/IsmMapFluidEvent';
import { readShaderSource } from '../../../../../../tools/utils/wgsl/readShaderSource';

describe('packIsmMapFluidEvents', () => {
  it('packs each event at its own EVENT_STRIDE-aligned offset, in field order', () => {
    // Exactly representable in f32 (halves and quarters), so the Float32Array
    // round-trip can't fail on rounding — this test is about offsets, not precision.
    const events: IsmMapFluidEvent[] = [
      { az: 10, ring: 20, birthStep: 3, strength: 1.5, radiusScale: 2.5 },
      { az: 11, ring: 21, birthStep: 4, strength: 1.75, radiusScale: 2.25 },
    ];
    const packed = packIsmMapFluidEvents(events);

    expect(packed.length).toBe(events.length * ISM_MAP_FLUID_EVENT_STRIDE);
    for (let i = 0; i < events.length; i++) {
      const base = i * ISM_MAP_FLUID_EVENT_STRIDE;
      expect(packed[base]).toBe(events[i]!.az);
      expect(packed[base + 1]).toBe(events[i]!.ring);
      expect(packed[base + 2]).toBe(events[i]!.birthStep);
      expect(packed[base + 3]).toBe(events[i]!.strength);
      expect(packed[base + 4]).toBe(events[i]!.radiusScale);
      for (let pad = 5; pad < ISM_MAP_FLUID_EVENT_STRIDE; pad++) {
        expect(packed[base + pad]).toBe(0);
      }
    }
  });

  it('packs zero events into an empty buffer', () => {
    expect(packIsmMapFluidEvents([]).length).toBe(0);
  });
});

/**
 * ismMapFluidVelocity.wesl has no named struct for events (a flat
 * `array<f32>`, not a uniform), so the offset authority is its `EVENT_STRIDE`
 * constant plus the field order its `composedVelocity` reads back at
 * `events[base + N]` — this is the ONE thing tying this packer to the
 * shader's own contract at all.
 */
describe('packIsmMapFluidEvents ↔ ismMapFluidVelocity.wesl EVENT_STRIDE', () => {
  const source = readShaderSource(
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidVelocity.wesl',
  );

  it('ISM_MAP_FLUID_EVENT_STRIDE matches the shader’s own EVENT_STRIDE constant', () => {
    const match = /const EVENT_STRIDE: u32 = (\d+)u;/.exec(source);
    expect(match, 'EVENT_STRIDE constant not found').not.toBeNull();
    expect(ISM_MAP_FLUID_EVENT_STRIDE).toBe(Number(match![1]));
  });

  it('reads each event field at the index the packer writes it to', () => {
    const fieldRe = /let\s+(\w+)\s*=\s*events\[base(?:\s*\+\s*(\d+)u)?\]/g;
    const seen = new Map<string, number>();
    let m: RegExpExecArray | null;
    while ((m = fieldRe.exec(source)) !== null) {
      const [, name, offset] = m;
      if (!seen.has(name!)) seen.set(name!, offset === undefined ? 0 : Number(offset));
    }
    // composedVelocity's own let-bindings (evAz.. — packIsmMapFluidEvents.ts's
    // az/ring/birthStep/strength/radiusScale under the shader's own names).
    expect(Object.fromEntries(seen)).toEqual({
      evAz: 0,
      evRing: 1,
      birthStep: 2,
      strength: 3,
      radiusScale: 4,
    });
  });
});
