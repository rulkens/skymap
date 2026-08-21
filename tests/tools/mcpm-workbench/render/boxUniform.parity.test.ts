/**
 * TS↔WESL parity: boxLines.wesl's `BoxUniform` struct vs. `BOX_UNIFORM_BYTES`
 * and the byte offsets boxPreviewPass.ts's `draw()` writes into `boxF32`
 * (`boxF32.set(..., N)` — N is a FLOAT index, so byte offset = N * 4). A
 * struct-offset mismatch here fails silent (WebGPU only validates total
 * buffer size, not per-field offsets), so this test — not the compiler — is
 * what catches a reordered/added/removed field. Same idiom as
 * `tests/data/selectionEncoding.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BOX_UNIFORM_BYTES } from '../../../../tools/mcpm-workbench/src/render/boxPreviewPass';

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

/** Cumulative byte offset of each field, in declaration order. */
function fieldOffsets(fields: ReadonlyArray<[string, string]>): Map<string, number> {
  const offsets = new Map<string, number>();
  let offset = 0;
  for (const [name, type] of fields) {
    const size = WGSL_TYPE_BYTES[type];
    if (size === undefined) throw new Error(`unhandled WGSL type ${type} for field ${name}`);
    offsets.set(name, offset);
    offset += size;
  }
  return offsets;
}

describe('BoxUniform TS↔WESL parity (boxLines.wesl ↔ boxPreviewPass.ts)', () => {
  const text = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/mcpm/boxLines.wesl'),
    'utf-8',
  );
  const fields = parseWeslStructFields(text, 'BoxUniform');
  const offsets = fieldOffsets(fields);

  it('total struct size equals BOX_UNIFORM_BYTES', () => {
    const total = fields.reduce((sum, [, type]) => sum + (WGSL_TYPE_BYTES[type] ?? 0), 0);
    expect(total).toBe(BOX_UNIFORM_BYTES);
  });

  it('each field lands at the byte offset boxPreviewPass.ts’s draw() writes it to', () => {
    // boxF32.set(worldToVoxel(...), 0)           -> center @ byte 0
    // boxF32.set(halfExtentsVoxel, 4)             -> halfExtents @ byte 16
    // boxF32.set(rotate(...pendingBasis.x), 8)    -> basisX @ byte 32
    // boxF32.set(rotate(...pendingBasis.y), 12)   -> basisY @ byte 48
    // boxF32.set(rotate(...pendingBasis.z), 16)   -> basisZ @ byte 64
    expect(offsets.get('center')).toBe(0);
    expect(offsets.get('halfExtents')).toBe(16);
    expect(offsets.get('basisX')).toBe(32);
    expect(offsets.get('basisY')).toBe(48);
    expect(offsets.get('basisZ')).toBe(64);
  });
});
