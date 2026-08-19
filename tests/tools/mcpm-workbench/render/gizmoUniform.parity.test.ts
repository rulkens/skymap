/**
 * TS↔WESL parity: boxLines.wesl's `GizmoUniform` struct vs. `GIZMO_UNIFORM_BYTES`
 * and the byte offsets boxPreviewPass.ts's `draw()` writes into `gizmoI32`
 * (`gizmoI32[N] = ...` — N is an INT32 index, so byte offset = N * 4). A
 * struct-offset mismatch here fails silent (WebGPU only validates total
 * buffer size, not per-field offsets), so this test — not the compiler — is
 * what catches a reordered/added/removed field. Same idiom as
 * `boxUniform.parity.test.ts` (this is the same file's seventh mirrored
 * struct, uncovered by R2 — see task-R2-report.md's Concerns).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GIZMO_UNIFORM_BYTES } from '../../../../tools/mcpm-workbench/src/render/boxPreviewPass';

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

describe('GizmoUniform TS↔WESL parity (boxLines.wesl ↔ boxPreviewPass.ts)', () => {
  const text = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/mcpm/boxLines.wesl'),
    'utf-8',
  );
  const fields = parseWeslStructFields(text, 'GizmoUniform');
  const offsets = fieldOffsets(fields);

  it('total struct size equals GIZMO_UNIFORM_BYTES', () => {
    const total = fields.reduce((sum, [, type]) => sum + (WGSL_TYPE_BYTES[type] ?? 0), 0);
    expect(total).toBe(GIZMO_UNIFORM_BYTES);
  });

  it('each field lands at the byte offset boxPreviewPass.ts’s draw() writes it to', () => {
    // gizmoI32[0] = encodeGizmoHandleId(hoverHandle)   -> hoverHandle @ byte 0
    // gizmoI32[1] = encodeGizmoHandleId(activeHandle)  -> activeHandle @ byte 4
    expect(offsets.get('hoverHandle')).toBe(0);
    expect(offsets.get('activeHandle')).toBe(4);
  });
});
