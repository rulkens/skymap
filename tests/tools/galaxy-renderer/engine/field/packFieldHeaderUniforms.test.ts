/**
 * Parity guard: `milkyWay/field/io.wesl`'s `FieldUniforms` is the offset
 * authority, and `packFieldHeaderUniforms` writes raw indices into a
 * Float32Array — a wrong index throws nothing, it just ships garbage, and on
 * WebKit a mislaid uniform drops the frame with no error at all. Neither home
 * is restated here: the WESL offsets are computed from the scraped struct,
 * and the TS offsets are OBSERVED by finding unique sentinels in the packed
 * buffer, so reordering either side fails the comparison.
 */
import { describe, expect, it } from 'vitest';

import {
  FIELD_HEADER_FLOATS,
  packFieldHeaderUniforms,
} from '../../../../../tools/galaxy-renderer/src/engine/field/packFieldUniforms';
import type { FieldHeaderInput } from '../../../../../tools/galaxy-renderer/@types/engine/FieldHeaderInput';
import { layoutWgslStruct } from '../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const struct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/milkyWay/field/io.wesl'),
    'FieldUniforms',
  ),
  (type) => {
    const p = wgslPrimitiveLayout(type);
    if (!p) throw new Error(`FieldUniforms field type ${type} has no layout entry`);
    return p;
  },
);

/** Byte offset of a `FieldUniforms` member, from the shader. */
function at(member: string): number {
  const offset = struct.offsets.get(member);
  expect(offset, `member ${member} missing from FieldUniforms`).toBeDefined();
  return offset!;
}

// Distinct integers, exactly representable in f32, none of them 0 — so every
// sentinel lands in exactly one place and no zero-filled lane can match one.
const EMISSION_COUNT = 7;
const view = new Float32Array(16);
for (let i = 0; i < 16; i++) view[i] = 12000 + i;

const input: FieldHeaderInput = {
  camera: {
    eye: [11000, 11001, 11002],
    view,
    fov: 1,
    aspect: 13000,
    lensShiftX: 13001,
    exposure: 13002,
  },
  emissionCount: EMISSION_COUNT,
  primaryCount: 14002,
  targetSizePx: [15000, 15001],
  dust: {
    count: 14001,
    extinctionRgb: [17000, 17001, 17002],
    noise: { tileUnits: 18000, amplitude: 18001, cloudOffset: 18002, contrastExp: 18003 },
    slices: { t1: 19000, t2: 19001, t3: 19002 },
    mapHeightPx: 16000,
    detail: 24000,
  },
  debugViews: { dust: 21000, sfMap: 21001, orientation: 21002, bubble: 21003 },
  galaxyWeight: 22000,
  sfMapChannels: { gasWeight: 23000, recentSfWeight: 23001, activityWeight: 23002 },
};

const packed = packFieldHeaderUniforms(input);

/** Byte offset a sentinel landed at (asserting it landed exactly once). */
function observed(value: number): number {
  const i = packed.indexOf(value);
  expect(i, `sentinel ${value} not found`).toBeGreaterThanOrEqual(0);
  expect(packed.lastIndexOf(value), `sentinel ${value} is not unique`).toBe(i);
  return i * 4;
}

const lane = (byteOffset: number): number => packed[byteOffset / 4]!;

describe('packFieldHeaderUniforms ↔ milkyWay/field/io.wesl FieldUniforms', () => {
  it('packs exactly the struct FieldUniforms declares', () => {
    expect(FIELD_HEADER_FLOATS * 4).toBe(struct.layout.size);
  });

  it('puts every vec4 where the shader declares it', () => {
    expect(observed(11000)).toBe(at('eye'));
    // The basis rows are a stride-4 gather off a column-major view matrix,
    // and camFwd is NEGATED — a transposed read would find these swapped.
    expect(observed(12000)).toBe(at('camRight'));
    expect(observed(12001)).toBe(at('camUp'));
    expect(observed(-12002)).toBe(at('camFwd'));
    // params.x is tan(fov/2), a transformed value with no sentinel; aspect
    // rides lane 1.
    expect(observed(13000)).toBe(at('params') + 4);
    // counts.x/.y are both emissionCount, so only lanes 2 and 3 are uniquely
    // locatable.
    expect(observed(14001)).toBe(at('counts') + 8);
    expect(observed(14002)).toBe(at('counts') + 12);
    // counts2.x is unused; dustMapHeightPx rides lane 1.
    expect(observed(16000)).toBe(at('counts2') + 4);
    expect(observed(17000)).toBe(at('dustExtinction'));
    expect(observed(18000)).toBe(at('dustNoise'));
    expect(observed(19000)).toBe(at('dustSlices'));
    expect(observed(21000)).toBe(at('debugView'));
    // debugView.w is the galaxy weight, not a fourth view — which is why the
    // bubble view needs a vec4 of its own.
    expect(observed(22000)).toBe(at('debugView') + 12);
    expect(observed(21003)).toBe(at('bubbleView'));
    expect(observed(23000)).toBe(at('sfMapChannels'));
    expect(observed(24000)).toBe(at('dustDetail'));
  });

  it('derives dustOffset as emissionCount, since dust is appended last', () => {
    expect(lane(at('counts') + 4)).toBe(EMISSION_COUNT);
  });

  it('writes the dust lanes inert when a pass has no dust, rather than skipping them', () => {
    // `dst` is a scratch reused across frames and headers, so a skipped write
    // would ship the previous pass's dust to a pass that has none.
    const dst = new Float32Array(FIELD_HEADER_FLOATS).fill(-999);
    const { dust: _omitted, ...noDust } = input;
    packFieldHeaderUniforms(noDust, dst);
    const four = (byteOffset: number) => [...dst.slice(byteOffset / 4, byteOffset / 4 + 4)];

    expect(dst[at('counts') / 4 + 2]).toBe(0); // dustCount
    expect(dst[at('counts2') / 4 + 1]).toBe(0); // dustMapHeightPx
    expect(four(at('dustExtinction'))).toEqual([0, 0, 0, 0]);
    // tileUnits and contrastExp are 1, not 0: dustMap.wesl divides by the
    // first and raises `pow` to the second.
    expect(four(at('dustNoise'))).toEqual([1, 0, 0, 1]);
    expect(four(at('dustSlices'))).toEqual([0, 0, 0, 0]);
    expect(four(at('dustDetail'))).toEqual([0, 0, 0, 0]);
  });
});
