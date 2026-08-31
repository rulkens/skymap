/**
 * TS↔WESL parity: camera.wesl's `McpmCamera` struct vs. `MCPM_CAMERA_BYTES`
 * and the byte offsets writeMcpmCamera.ts writes each field to (`out.set(...,
 * N)` / `out[N] = ...` — N is a FLOAT index, byte offset = N * 4). Every mcpm
 * screen-space pass shares this one camera write, so a silent offset drift
 * here would misalign the raymarch, the box preview, and the splat/overlay
 * passes simultaneously. Same idiom as `tests/data/selectionEncoding.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MCPM_CAMERA_BYTES } from '../../../../tools/mcpm-workbench/src/render/writeMcpmCamera';

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

describe('McpmCamera TS↔WESL parity (camera.wesl ↔ writeMcpmCamera.ts)', () => {
  const text = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/mcpm/camera.wesl'),
    'utf-8',
  );
  const fields = parseWeslStructFields(text, 'McpmCamera');
  const floatOffsets = fieldFloatOffsets(fields);

  it('total struct size equals MCPM_CAMERA_BYTES', () => {
    const totalBytes = fields.reduce((sum, [, type]) => sum + (WGSL_TYPE_BYTES[type] ?? 0), 0);
    expect(totalBytes).toBe(MCPM_CAMERA_BYTES);
  });

  it('each field lands at the float index writeMcpmCamera.ts writes it to', () => {
    // out.set(eye, 0)             -> camVoxel @ float 0
    // out[3] = tan(fovY/2)        -> tanHalfFov
    // out.set(basis.right, 4)     -> camRight @ float 4
    // out[7] = width / height     -> aspect
    // out.set(basis.up, 8)        -> camUp @ float 8
    // out[11] = width             -> screenWidth
    // out.set(basis.forward, 12)  -> camForward @ float 12
    // out[15] = height            -> screenHeight
    expect(floatOffsets.get('camVoxel')).toBe(0);
    expect(floatOffsets.get('tanHalfFov')).toBe(3);
    expect(floatOffsets.get('camRight')).toBe(4);
    expect(floatOffsets.get('aspect')).toBe(7);
    expect(floatOffsets.get('camUp')).toBe(8);
    expect(floatOffsets.get('screenWidth')).toBe(11);
    expect(floatOffsets.get('camForward')).toBe(12);
    expect(floatOffsets.get('screenHeight')).toBe(15);
  });
});
