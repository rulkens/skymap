/**
 * packIsmMapFluidStepIndex — the two things a real bug could break: the
 * per-step row landing at the wrong strideBytes-aligned offset, and the
 * active-event window landing in the wrong float slot within that row.
 * Expected windows below are hand-computed from the fixture, not delegated
 * to `ismMapFluidEventWindow` (that function has its own test) — so this
 * test would actually fail if the two disagreed.
 */
import { describe, expect, it } from 'vitest';
import {
  packIsmMapFluidStepIndex,
  ISM_MAP_FLUID_STEP_INDEX_FLOATS,
} from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packIsmMapFluidStepIndex';
import type { IsmMapFluidEvent } from '../../../../../../src/@types/galaxy/IsmMapFluidEvent';
import { layoutWgslStruct } from '../../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

describe('packIsmMapFluidStepIndex', () => {
  it('places step index and the active-event window at each strideBytes-aligned row', () => {
    const strideBytes = 256; // real device alignment, NOT a multiple of 4 floats' worth of payload
    const strideFloats = strideBytes / 4;
    const impulseDuration = 3;
    // Already sorted ascending by birthStep, as buildGalaxyIsmMapFluidEvents guarantees.
    const events: IsmMapFluidEvent[] = [
      { az: 0, ring: 0, birthStep: 0, strength: 1, radiusScale: 1 },
      { az: 0, ring: 0, birthStep: 1, strength: 1, radiusScale: 1 },
      { az: 0, ring: 0, birthStep: 4, strength: 1, radiusScale: 1 },
      { az: 0, ring: 0, birthStep: 4, strength: 1, radiusScale: 1 },
    ];
    const steps = 6;

    const data = packIsmMapFluidStepIndex(events, steps, impulseDuration, strideBytes);

    expect(data.length).toBe(steps * strideFloats);
    // step 0: birthStep in (-3, 0] -> event 0 only -> [0, 1)
    // step 2: birthStep in (-1, 2] -> events 0, 1 -> [0, 2)
    // step 5: birthStep in (2, 5]  -> events 2, 3 -> [2, 4)
    const expected: ReadonlyArray<[step: number, start: number, end: number]> = [
      [0, 0, 1],
      [2, 0, 2],
      [5, 2, 4],
    ];
    for (const [step, start, end] of expected) {
      const base = step * strideFloats;
      expect(data[base], `step ${step} index`).toBe(step);
      expect(data[base + 1], `step ${step} activeStart`).toBe(start);
      expect(data[base + 2], `step ${step} activeEnd`).toBe(end);
      for (let pad = 3; pad < strideFloats; pad++) {
        expect(data[base + pad], `step ${step} padding at float ${pad}`).toBe(0);
      }
    }
  });
});

describe('packIsmMapFluidStepIndex ↔ ismMapFluidStep.wesl IsmMapFluidStepIndex', () => {
  const struct = layoutWgslStruct(
    parseWgslStructFields(
      readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidStep.wesl'),
      'IsmMapFluidStepIndex',
    ),
    (type) => {
      const p = wgslPrimitiveLayout(type);
      if (!p) throw new Error(`IsmMapFluidStepIndex field type ${type} has no layout entry`);
      return p;
    },
  );

  it('declares step, activeStart, activeEnd in that order at the offsets the packer writes to', () => {
    // packIsmMapFluidStepIndex.ts writes fixed positions (base, base+1, base+2)
    // rather than looking up names — a struct reorder here would silently
    // shift every field after the reordered one, same landmine every other
    // ismMap packer in this directory guards against.
    expect([...struct.offsets.keys()]).toEqual(['step', 'activeStart', 'activeEnd']);
    expect(struct.offsets.get('step')).toBe(0);
    expect(struct.offsets.get('activeStart')).toBe(4);
    expect(struct.offsets.get('activeEnd')).toBe(8);
  });

  it('ISM_MAP_FLUID_STEP_INDEX_FLOATS covers the whole struct', () => {
    expect(ISM_MAP_FLUID_STEP_INDEX_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });
});
