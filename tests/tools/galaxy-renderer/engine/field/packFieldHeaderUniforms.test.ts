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
    carve: { carve: 28000, sharpness: 28001, stretch: 28002 },
    slices: { t1: 19000, t2: 19001, t3: 19002 },
    mapHeightPx: 16000,
    detail: 24000,
  },
  debugViews: { dust: 21000, ismMap: 21001, orientation: 21002, bubble: 21003 },
  galaxyWeight: 22000,
  ismMapChannels: {
    gasWeight: 23000,
    starsWeight: 23001,
    activityWeight: 23002,
    dustWeight: 23003,
  },
  hiiTexture: { scale: 25000, contrast: 25001 },
  ismMapSeeding: { weight: 27000, cap: 27001, globalMean: 27002 },
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
    // bubbleView.y/.z/.w are the seeding view's own weight/cap/globalMean
    // (io.wesl's bubbleView doc) — free lanes claimed alongside the bubble
    // intensity at .x, not a fourth debug view.
    expect(observed(27000)).toBe(at('bubbleView') + 4);
    expect(observed(27001)).toBe(at('bubbleView') + 8);
    expect(observed(27002)).toBe(at('bubbleView') + 12);
    expect(observed(23000)).toBe(at('ismMapChannels'));
    // ismMapChannels.w was the header's one slack scalar — dustWeight now
    // fills it, so this pins it stays put rather than silently colliding
    // with the next vec4.
    expect(observed(23003)).toBe(at('ismMapChannels') + 12);
    expect(observed(24000)).toBe(at('dustDetail'));
    // dustDetail.y/.z are the HII tier's own tier-global texture scale/
    // contrast, unrelated to S4's own strength lane at .x — they ride this
    // vec4's two free lanes (io.wesl's dustDetail doc). .w is spare (freed
    // when dustDetail.wesl's legacy/swept blend weight was deleted; briefly
    // the seeding view's cap before that moved back into bubbleView.z).
    expect(observed(25000)).toBe(at('dustDetail') + 4);
    expect(observed(25001)).toBe(at('dustDetail') + 8);
    // dustCarve (S5) — carve/sharpness/stretch, .w spare.
    expect(observed(28000)).toBe(at('dustCarve'));
    expect(observed(28001)).toBe(at('dustCarve') + 4);
    expect(observed(28002)).toBe(at('dustCarve') + 8);
  });

  it('derives dustOffset as emissionCount, since dust is appended last', () => {
    expect(lane(at('counts') + 4)).toBe(EMISSION_COUNT);
  });

  it('writes the dust lanes inert when a pass has no dust, rather than skipping them', () => {
    // `dst` is a scratch reused across frames and headers, so a skipped write
    // would ship the previous pass's dust to a pass that has none.
    const dst = new Float32Array(FIELD_HEADER_FLOATS).fill(-999);
    // `hiiTexture`/`ismMapSeeding` omitted too — the HII pass packs `dust` and
    // `ismMapSeeding` inert (ismMapPresent.wesl binds only the field header),
    // and this is the one call that pins every default lands without
    // clobbering another in a shared vec4.
    const {
      dust: _omittedDust,
      hiiTexture: _omittedHiiTexture,
      ismMapSeeding: _omittedIsmMapSeeding,
      ...noDust
    } = input;
    packFieldHeaderUniforms(noDust, dst);
    const four = (byteOffset: number) => [...dst.slice(byteOffset / 4, byteOffset / 4 + 4)];

    expect(dst[at('counts') / 4 + 2]).toBe(0); // dustCount
    expect(dst[at('counts2') / 4 + 1]).toBe(0); // dustMapHeightPx
    expect(four(at('dustExtinction'))).toEqual([0, 0, 0, 0]);
    // tileUnits and contrastExp are 1, not 0: dustMap.wesl divides by the
    // first and raises `pow` to the second.
    expect(four(at('dustNoise'))).toEqual([1, 0, 0, 1]);
    expect(four(at('dustSlices'))).toEqual([0, 0, 0, 0]);
    // .x (S4 strength) is 0 like every other inert dust lane; .y (hiiTexture
    // scale) is 0 too, but .z (hiiTexture contrast) is 1, not 0 — same
    // "the neutral value, not zero" reasoning `dustNoise`'s tileUnits/
    // contrastExp lanes use just above. .w is spare, always 0.
    expect(four(at('dustDetail'))).toEqual([0, 0, 1, 0]);
    // .x (carve) is the mandatory-identity 0; .y/.z (sharpness/stretch) are
    // INERT_DUST's own named identity values, not 0, since dustMap.wesl skips
    // the whole S5 branch on .x alone and never reads them here.
    expect(four(at('dustCarve'))).toEqual([0, 0.5, 1, 0]);
    // .x (bubble intensity, from `debugViews`, still supplied) stays; .y/.z/.w
    // (weight/cap/globalMean) are all inert at 0 — `ismMapSeeding` omitted
    // too, so INERT_ISM_MAP_SEEDING lands here (its own doc: cap 0 is
    // "uncapped", the SAME neutral value as everything else in this vec4).
    expect(four(at('bubbleView'))).toEqual([21003, 0, 0, 0]);
  });
});
