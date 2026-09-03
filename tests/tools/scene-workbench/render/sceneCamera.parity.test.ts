/**
 * TS↔WESL parity: lidarPoint.wesl's `SceneCamera` struct vs. `SCENE_CAMERA_BYTES`
 * and the byte offsets writeSceneCamera.ts writes each field to (`out.set(...,
 * N)` / `out[N] = ...` — N is a FLOAT index, byte offset = N * 4). A drifted
 * offset is invisible until the frame stops presenting: the quad expansion and
 * the projection would silently read each other's floats. Mirrors
 * `tests/tools/mcpm-workbench/render/mcpmCamera.parity.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SCENE_CAMERA_BYTES } from '../../../../tools/scene-workbench/src/render/writeSceneCamera';

const WGSL_TYPE_BYTES: Record<string, number> = {
  f32: 4,
  'vec3<f32>': 12,
  'mat4x4<f32>': 64,
};

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

describe('SceneCamera TS↔WESL parity (lidarPoint.wesl ↔ writeSceneCamera.ts)', () => {
  const text = readFileSync(
    join(process.cwd(), 'tools/scene-workbench/src/render/shaders/lidarPoint.wesl'),
    'utf-8',
  );
  const fields = parseWeslStructFields(text, 'SceneCamera');
  const floatOffsets = fieldFloatOffsets(fields);

  it('total struct size equals SCENE_CAMERA_BYTES', () => {
    const totalBytes = fields.reduce((sum, [, type]) => sum + (WGSL_TYPE_BYTES[type] ?? 0), 0);
    expect(totalBytes).toBe(SCENE_CAMERA_BYTES);
  });

  it('each field lands at the float index writeSceneCamera.ts writes it to', () => {
    // out.set(viewProj, 0)   -> viewProj @ float 0   (bytes 0..63)
    // out.set(rightM, 16)    -> rightM   @ float 16  (byte 64)
    // out[19] = pointSizePx  -> pointSizePx          (byte 76)
    // out.set(upM, 20)       -> upM      @ float 20  (byte 80)
    // out[23] = height       -> viewportH            (byte 92)
    // out.set(eyeM, 24)      -> eyeM     @ float 24  (byte 96)
    // out[27] = metresPerPx  -> metresPerPx          (byte 108)
    expect(floatOffsets.get('viewProj')).toBe(0);
    expect(floatOffsets.get('rightM')).toBe(16);
    expect(floatOffsets.get('pointSizePx')).toBe(19);
    expect(floatOffsets.get('upM')).toBe(20);
    expect(floatOffsets.get('viewportH')).toBe(23);
    expect(floatOffsets.get('eyeM')).toBe(24);
    expect(floatOffsets.get('metresPerPx')).toBe(27);
  });
});
