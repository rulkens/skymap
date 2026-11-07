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
  ANTIQUE_UNIFORM_BYTES,
} from '../../../../src/data/rendering/antiqueLook';
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

function layoutOf(file: string, struct: string) {
  return layoutWgslStruct(
    parseWgslStructFields(readShaderSource(`${DIR}/${file}`), struct),
    primitive,
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
    type === `array<${row}` ? { size: rowLayout.layout.size * length, align: 16 } : primitive(type),
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
      size: { width: 1001, height: 1002 },
      unitPx: 1003,
      bodies: true,
      depthCover: true,
      captions: false,
      paper: true,
      rays: { tl: [1011, 0, 0], tr: [1012, 0, 0], bl: [1013, 0, 0], br: [1014, 0, 0] },
      seed: 1021,
      rulings: { raDeg: 1022, decDeg: 1023 },
      hatchAngle: 1024,
    });
    const sentinel: Record<string, number> = {
      res: 1001,
      unit: 1003,
      rayTL: 1011,
      rayTR: 1012,
      rayBL: 1013,
      rayBR: 1014,
      seed: 1021,
      raStep: 1022,
      decStep: 1023,
      hatchAngle: 1024,
    };
    expect([...offsets.keys()].sort()).toEqual([...Object.keys(sentinel), 'flags'].sort());
    for (const [member, value] of Object.entries(sentinel))
      expect(offsetOf(packed, value), member).toBe(offsets.get(member));
    // bodies (bit 0), paper (bit 2) and depth cover, the bit cover.wesl tests.
    const depthBit = readShaderSource(`${DIR}/cover.wesl`).match(/FLAG_DEPTH_COVER: u32 = (\d+)u/);
    expect(Number(depthBit?.[1])).toBe(0b1000);
    expect(new Uint32Array(packed)[offsets.get('flags')! / 4]).toBe(0b1101);
  });

  it('packAntiqueOrnaments writes AntiqueOrnaments row by row', () => {
    const { length, row, header } = listOf('ornaments.wesl', 'AntiqueOrnaments', 'Ornament');
    expect(length).toBe(ANTIQUE_MAX_ORNAMENTS);
    expect(row.layout.size * length + header.offsets.get('items')!).toBe(ANTIQUE_ORNAMENT_BYTES);
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
      },
      {
        centrePx: [2001, 2002],
        halfPx: [2003, 2004],
        rotation,
        opacity: 2005,
        clearsBeneath: true,
        pigment: 2006,
        rect: [2007, 2008, 2009, 2010],
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
  });

  it('packAntiqueGlyphs writes AntiqueLettering row by row', () => {
    const { length, row, header } = listOf('fragment.wesl', 'AntiqueLettering', 'Glyph');
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
