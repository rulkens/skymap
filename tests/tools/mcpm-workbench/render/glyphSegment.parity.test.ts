/**
 * TS↔WESL parity: boxLines.wesl's `GlyphSegment` struct vs.
 * `GLYPH_SEGMENT_FLOATS` and the byte offsets boxPreviewPass.ts's `draw()`
 * writes each field to within one segment's 12-float slot (`glyphF32[base +
 * N]` / `glyphI32[base + N]`). Same silent-drift risk and idiom as
 * `boxUniform.parity.test.ts` beside it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GLYPH_SEGMENT_FLOATS } from '../../../../tools/mcpm-workbench/src/render/boxPreviewPass';

const WGSL_TYPE_BYTES: Record<string, number> = { f32: 4, i32: 4, u32: 4, 'vec3<f32>': 12 };

function parseWeslStructFields(text: string, structName: string): Array<[string, string]> {
  const structRe = new RegExp(`struct\\s+${structName}\\s*{([^}]*)}`, 's');
  const body = structRe.exec(text)?.[1];
  if (body === undefined) throw new Error(`struct ${structName} not found`);
  const fieldRe = /(\w+)\s*:\s*([\w<>]+)\s*,/g;
  const fields: Array<[string, string]> = [];
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(body)) !== null) fields.push([m[1]!, m[2]!]);
  return fields;
}

function fieldFloatOffsets(fields: ReadonlyArray<[string, string]>): Map<string, number> {
  const offsets = new Map<string, number>();
  let byteOffset = 0;
  for (const [name, type] of fields) {
    const size = WGSL_TYPE_BYTES[type];
    if (size === undefined) throw new Error(`unhandled WGSL type ${type} for field ${name}`);
    offsets.set(name, byteOffset / 4);
    byteOffset += size;
  }
  return offsets;
}

describe('GlyphSegment TS↔WESL parity (boxLines.wesl ↔ boxPreviewPass.ts)', () => {
  const text = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/mcpm/boxLines.wesl'),
    'utf-8',
  );
  const fields = parseWeslStructFields(text, 'GlyphSegment');
  const floatOffsets = fieldFloatOffsets(fields);

  it('total struct size in floats equals GLYPH_SEGMENT_FLOATS', () => {
    const totalBytes = fields.reduce((sum, [, type]) => sum + (WGSL_TYPE_BYTES[type] ?? 0), 0);
    expect(totalBytes / 4).toBe(GLYPH_SEGMENT_FLOATS);
  });

  it('each field lands at the float index boxPreviewPass.ts’s draw() writes it to', () => {
    // glyphF32[base + 0..2] = a  -> posA @ float 0
    // glyphF32[base + 3]    = widthA
    // glyphF32[base + 4..6] = b  -> posB @ float 4
    // glyphF32[base + 7]    = widthB
    // glyphI32[base + 8]    = seg.handleId
    expect(floatOffsets.get('posA')).toBe(0);
    expect(floatOffsets.get('widthA')).toBe(3);
    expect(floatOffsets.get('posB')).toBe(4);
    expect(floatOffsets.get('widthB')).toBe(7);
    expect(floatOffsets.get('handleId')).toBe(8);
  });
});
