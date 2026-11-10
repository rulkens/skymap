/**
 * The antique look's three TS-packed records against the WGSL structs that read
 * them: `AntiqueUniforms` (io.wesl), `AntiqueOrnaments` (ornaments.wesl) and
 * `AntiqueLettering` (fragment.wesl). Each packer runs with a distinct sentinel
 * per field and every sentinel must land where the struct declares its member,
 * so a reorder on either side fails here instead of scrambling the plate. The
 * list lengths are checked against the TS caps.
 */

import { describe, expect, it } from 'vitest';

import {
  ANTIQUE_GLYPH_BYTES,
  ANTIQUE_MAX_GLYPHS,
  ANTIQUE_MAX_ORNAMENTS,
  ANTIQUE_ORNAMENT_BYTES,
  ANTIQUE_ORNAMENT_GRID_VEC4,
  ANTIQUE_UNIFORM_BYTES,
} from '../../../../src/data/rendering/antiqueLook';
import { ANTIQUE_PLATE_ROWS } from '../../../../src/data/rendering/antiqueTuning';
import { packAntiqueUniforms } from '../../../../src/utils/gpu/antiqueLook/packAntiqueUniforms';
import { packAntiqueOrnaments } from '../../../../src/utils/gpu/antiqueLook/packAntiqueOrnaments';
import { packAntiqueGlyphs } from '../../../../src/utils/gpu/antiqueLook/packAntiqueGlyphs';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';
import type { WgslTypeLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const DIR = 'src/services/gpu/shaders/antiqueLook';

function primitive(type: string): WgslTypeLayout {
  const layout = wgslPrimitiveLayout(type);
  if (!layout) throw new Error(`no layout for WGSL type ${type}`);
  return layout;
}

/** A struct's layout; a member of another struct type declared in the same file nests. */
function layoutOf(file: string, struct: string): ReturnType<typeof layoutWgslStruct> {
  return layoutWgslStruct(
    parseWgslStructFields(readShaderSource(`${DIR}/${file}`), struct),
    (type) => wgslPrimitiveLayout(type) ?? layoutOf(file, type).layout,
  );
}

/** A list record: `count` plus padding, then `items: array<Row, N>`. */
function listOf(file: string, struct: string, row: string) {
  const source = readShaderSource(`${DIR}/${file}`).replace(/\/\/[^\n]*/g, '');
  const items = source.match(
    new RegExp(`struct\\s+${struct}\\s*\\{[^}]*items\\s*:\\s*array<${row},\\s*(\\d+)>`),
  );
  if (!items) throw new Error(`${struct}.items: array<${row}, N> not found in ${file}`);
  const length = Number(items[1]);
  const rowLayout = layoutOf(file, row);
  const header = layoutWgslStruct(parseWgslStructFields(source, struct), (type) =>
    type === `array<${row}`
      ? { size: rowLayout.layout.size * length, align: 16 }
      : type === 'array<vec4<f32>'
        ? { size: 16 * ANTIQUE_MAX_ORNAMENTS * ANTIQUE_ORNAMENT_GRID_VEC4, align: 16 }
        : primitive(type),
  );
  return { length, row: rowLayout, header };
}

/** Byte offset of a unique sentinel in a packed buffer. */
function offsetOf(packed: ArrayBuffer, value: number): number {
  const f32 = new Float32Array(packed);
  const target = Math.fround(value);
  const hits = [...f32.keys()].filter((i) => f32[i] === target);
  expect(hits, `sentinel ${value}`).toHaveLength(1);
  return hits[0]! * 4;
}

describe('antique look records ↔ WGSL structs', () => {
  it('packAntiqueUniforms writes AntiqueUniforms member by member', () => {
    const { offsets, layout } = layoutOf('io.wesl', 'AntiqueUniforms');
    expect(layout.size).toBe(ANTIQUE_UNIFORM_BYTES);
    const packed = packAntiqueUniforms({
      // A degenerate pinhole whose corner rays read x = 1011, 1012, 1013, 1014 (tl, tr, bl, br).
      projection: {
        kind: 'rectilinear',
        basis: { forward: [0, 0, 0], right: [1, 0, 0], up: [-2, 0, 0] },
        frustum: { tanLeft: 1013, tanRight: 1014, tanDown: 0, tanUp: 1 },
        size: { width: 1001, height: 1002 },
      },
      unitPx: 1003,
      depthCover: true,
      relief: null,
      moon: false,
      captions: false,
      paper: true,
      seed: 1021,
      rulings: {
        sky: {
          axes: [1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039],
          lonOffsetDeg: 1040,
          globeCentre: null,
          net: 1041,
          lon: { stepDeg: 1042, cellDeg: 1043 },
          lat: { stepDeg: 1044, cellDeg: 1045 },
        },
        globe: {
          axes: [1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059],
          lonOffsetDeg: 1060,
          globeCentre: [1062, 1063, 1064],
          net: 1061,
          lon: { stepDeg: 1065, cellDeg: 1066 },
          lat: { stepDeg: 1067, cellDeg: 1068 },
        },
      },
      hatchAngle: 1024,
      web: 1025,
      eye: [1026, 1027, 1028],
      tune: {
        hatchUnits: 1071,
        washGain: 1072,
        inkGain: 1073,
        lineInk: 1077,
        borderWash: 1078,
        tint: [1074, 1075, 1076],
        hidden: 0b101,
        letterWear: 1080,
      },
      subject: 1079,
    });
    const sentinel: Record<string, number> = {
      res: 1001,
      unit: 1003,
      rayTL: 1011,
      rayTR: 1012,
      rayBL: 1013,
      rayBR: 1014,
      seed: 1021,
      hatchAngle: 1024,
      tune: 1071,
      tint: 1074,
      borderWash: 1078,
      subject: 1079,
      letterWear: 1080,
    };
    expect([...offsets.keys()].sort()).toEqual(
      [...Object.keys(sentinel), 'flags', 'sky', 'globe', 'hidden'].sort(),
    );
    for (const [member, value] of Object.entries(sentinel))
      expect(offsetOf(packed, value), member).toBe(offsets.get(member));
    // Each ruling frame member by member: axes in the xyz lanes, the rest in w and `steps`.
    const frame = layoutOf('io.wesl', 'RulingFrame').offsets;
    const lane = (slot: 'sky' | 'globe', member: string, i: number) =>
      offsets.get(slot)! + frame.get(member)! + i * 4;
    for (const [slot, base] of [
      ['sky', 1030],
      ['globe', 1050],
    ] as const) {
      expect(offsetOf(packed, base + 1)).toBe(lane(slot, 'lon0', 0));
      expect(offsetOf(packed, base + 4)).toBe(lane(slot, 'lon90', 0));
      expect(offsetOf(packed, base + 7)).toBe(lane(slot, 'pole', 0));
      expect(offsetOf(packed, base + 10)).toBe(lane(slot, 'lon0', 3));
      expect(offsetOf(packed, base + 11)).toBe(lane(slot, 'lon90', 3));
    }
    expect(offsetOf(packed, 1062)).toBe(lane('globe', 'globe', 0));
    for (const [i, value] of [1065, 1067, 1066, 1068].entries())
      expect(offsetOf(packed, value)).toBe(lane('globe', 'steps', i));
    // The web weight rides rayTL's spare w lane (io.wesl's table).
    expect(offsetOf(packed, 1025)).toBe(offsets.get('rayTL')! + 12);
    // The eye rides the other three corners' w lanes.
    for (const [i, ray] of ['rayTR', 'rayBL', 'rayBR'].entries())
      expect(offsetOf(packed, 1026 + i)).toBe(offsets.get(ray)! + 12);
    // paper (bit 2) and depth cover, the bit mask.wesl tests.
    const depthBit = readShaderSource(`${DIR}/passes/maskFragment.wesl`).match(
      /FLAG_DEPTH_COVER: u32 = (\d+)u/,
    );
    expect(Number(depthBit?.[1])).toBe(0b1000);
    expect(new Uint32Array(packed)[offsets.get('flags')! / 4]).toBe(0b1100);
    for (const [i, value] of [1072, 1073, 1077].entries())
      expect(offsetOf(packed, value)).toBe(offsets.get('tune')! + (i + 1) * 4);
    expect(new Uint32Array(packed)[offsets.get('hidden')! / 4]).toBe(0b101);
  });

  it("fragment.wesl's HIDE_* bits follow ANTIQUE_PLATE_ROWS' order", () => {
    const source = readShaderSource(`${DIR}/passes/plateFragment.wesl`);
    const bits = [...source.matchAll(/const HIDE_(\w+): u32 = (\d+)u;/g)].map(([, name, bit]) => [
      name!.toLowerCase(),
      Number(bit),
    ]);
    expect(bits).toEqual(ANTIQUE_PLATE_ROWS.map(({ key }, i) => [key, 1 << i]));
  });

  it('packAntiqueOrnaments writes AntiqueOrnaments row by row', () => {
    const { length, row, header } = listOf('shared/ornaments.wesl', 'AntiqueOrnaments', 'Ornament');
    expect(length).toBe(ANTIQUE_MAX_ORNAMENTS);
    const grid = readShaderSource(`${DIR}/shared/ornaments.wesl`).match(
      /grid\s*:\s*array<vec4<f32>,\s*(\d+)>/,
    );
    expect(Number(grid?.[1])).toBe(ANTIQUE_MAX_ORNAMENTS * ANTIQUE_ORNAMENT_GRID_VEC4);
    expect(header.offsets.get('items')! + row.layout.size * length + Number(grid?.[1]) * 16).toBe(
      ANTIQUE_ORNAMENT_BYTES,
    );
    const rotation = 0.3;
    const packed = packAntiqueOrnaments([
      {
        centrePx: [0, 0],
        halfPx: [0, 0],
        rotation: 0,
        opacity: 0,
        clearsBeneath: false,
        pigment: 0,
        rect: [0, 0, 0, 0],
        lettering: false,
        washed: false,
        grid: null,
      },
      {
        centrePx: [2001, 2002],
        halfPx: [2003, 2004],
        rotation,
        opacity: 2005,
        clearsBeneath: true,
        pigment: 2006,
        rect: [2007, 2008, 2009, 2010],
        lettering: true,
        washed: true,
        grid: null,
      },
    ]);
    expect(new Uint32Array(packed)[header.offsets.get('count')! / 4]).toBe(2);
    const second = header.offsets.get('items')! + row.layout.size;
    const sentinel: Record<string, number> = {
      centre: 2001,
      half: 2003,
      rot: Math.cos(rotation),
      opacity: 2005,
      rect: 2007,
      pigment: 2006,
    };
    for (const [member, value] of Object.entries(sentinel))
      expect(offsetOf(packed, value), member).toBe(second + row.offsets.get(member)!);
    expect(new Float32Array(packed)[(second + row.offsets.get('clears')!) / 4]).toBe(1);
    expect(new Float32Array(packed)[(second + row.offsets.get('lettering')!) / 4]).toBe(1);
    expect(new Float32Array(packed)[(second + row.offsets.get('washed')!) / 4]).toBe(1);
  });

  it('packAntiqueGlyphs writes AntiqueLettering row by row', () => {
    const { length, row, header } = listOf(
      'passes/plateFragment.wesl',
      'AntiqueLettering',
      'Glyph',
    );
    expect(length).toBe(ANTIQUE_MAX_GLYPHS);
    expect(row.layout.size * length + header.offsets.get('items')!).toBe(ANTIQUE_GLYPH_BYTES);
    const packed = packAntiqueGlyphs([
      { centrePx: [0, 0], halfPx: [0, 0], rect: [0, 0, 0, 0] },
      { centrePx: [3001, 3002], halfPx: [3003, 3004], rect: [3005, 3006, 3007, 3008] },
    ]);
    expect(new Uint32Array(packed)[header.offsets.get('count')! / 4]).toBe(2);
    const second = header.offsets.get('items')! + row.layout.size;
    const sentinel: Record<string, number> = { centre: 3001, half: 3003, rect: 3005 };
    expect([...row.offsets.keys()].sort()).toEqual(Object.keys(sentinel).sort());
    for (const [member, value] of Object.entries(sentinel))
      expect(offsetOf(packed, value), member).toBe(second + row.offsets.get(member)!);
  });
});
