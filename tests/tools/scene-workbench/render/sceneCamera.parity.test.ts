/**
 * TS↔WESL parity: lidarPoint.wesl's `SceneCamera` struct vs. what
 * `writeSceneCamera` actually writes. The expected indices are PARSED from the
 * shader (WGSL alignment rules applied, so a reordered struct is modelled
 * correctly) and the writer is EXECUTED against them with a distinct sentinel
 * per field — a literal-vs-literal test would stay green while the two halves
 * drifted apart, and a drifted offset is invisible until the frame stops
 * presenting. Mirrors `tests/tools/mcpm-workbench/render/mcpmCamera.parity.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { SceneCameraView } from '../../../../tools/scene-workbench/src/render/sceneCameraView';
import {
  SCENE_CAMERA_BYTES,
  writeSceneCamera,
} from '../../../../tools/scene-workbench/src/render/writeSceneCamera';

/** WGSL's size AND alignment per type: a vec3 occupies 12 bytes but starts on 16. */
const WGSL_TYPE: Record<string, { size: number; align: number }> = {
  f32: { size: 4, align: 4 },
  i32: { size: 4, align: 4 },
  u32: { size: 4, align: 4 },
  'vec3<f32>': { size: 12, align: 16 },
  'vec4<f32>': { size: 16, align: 16 },
  'mat4x4<f32>': { size: 64, align: 16 },
};

const STRUCT_ALIGN = 16;

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

function roundUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

function layoutOf(fields: ReadonlyArray<[string, string]>): {
  floatOffsets: Map<string, number>;
  sizeBytes: number;
} {
  const floatOffsets = new Map<string, number>();
  let byteOffset = 0;
  for (const [name, type] of fields) {
    const layout = WGSL_TYPE[type];
    if (layout === undefined) throw new Error(`unhandled WGSL type ${type} for field ${name}`);
    byteOffset = roundUp(byteOffset, layout.align);
    floatOffsets.set(name, byteOffset / 4);
    byteOffset += layout.size;
  }
  return { floatOffsets, sizeBytes: roundUp(byteOffset, STRUCT_ALIGN) };
}

// One distinct value per field, so a field written to a neighbour's slot shows up
// as a wrong number rather than a coincidence. `upM` doubles as `lookAt`'s up and
// so must not be parallel to eye→target, or the view matrix comes back all-NaN.
const RIGHT_M = [11, 12, 13] as const;
const UP_M = [21, -22, 23] as const;
const EYE_M = [31, 32, 33] as const;
const POINT_SIZE_PX = 42;
const VIEWPORT_PX = [1600, 900] as const;
const FOV_Y_RAD = Math.PI / 4;

const VIEW: SceneCameraView = {
  eyeM: [...EYE_M],
  targetM: [0, 0, 0],
  rightM: [...RIGHT_M],
  upM: [...UP_M],
  fovYRad: FOV_Y_RAD,
  viewportPx: VIEWPORT_PX,
};

describe('SceneCamera TS↔WESL parity (lidarPoint.wesl ↔ writeSceneCamera.ts)', () => {
  const text = readFileSync(
    join(process.cwd(), 'tools/scene-workbench/src/render/shaders/lidarPoint.wesl'),
    'utf-8',
  );
  const { floatOffsets, sizeBytes } = layoutOf(parseWeslStructFields(text, 'SceneCamera'));

  const out = new Float32Array(SCENE_CAMERA_BYTES / 4);
  writeSceneCamera(out, VIEW, POINT_SIZE_PX);

  const at = (field: string): number => {
    const offset = floatOffsets.get(field);
    if (offset === undefined) throw new Error(`lidarPoint.wesl has no field ${field}`);
    return offset;
  };
  const vec3At = (field: string): number[] => Array.from(out.subarray(at(field), at(field) + 3));

  it('struct size equals SCENE_CAMERA_BYTES', () => {
    expect(sizeBytes).toBe(SCENE_CAMERA_BYTES);
  });

  it('writeSceneCamera lands every field on the shader struct offset', () => {
    expect(vec3At('rightM')).toEqual([...RIGHT_M]);
    expect(out[at('pointSizePx')]).toBe(POINT_SIZE_PX);
    expect(vec3At('upM')).toEqual([...UP_M]);
    expect(out[at('viewportH')]).toBe(VIEWPORT_PX[1]);
    expect(vec3At('eyeM')).toEqual([...EYE_M]);
    // Metres per pixel per metre of depth — the shader scales it by the clip w.
    // `Math.fround`: the store into a Float32Array is the only rounding here.
    expect(out[at('metresPerPx')]).toBe(
      Math.fround((2 * Math.tan(FOV_Y_RAD / 2)) / VIEWPORT_PX[1]),
    );
  });

  it('viewProj occupies the 16 floats before the first sentinel', () => {
    expect(at('viewProj')).toBe(0);
    expect(at('rightM')).toBe(16);
    // Finite and not left at zero: proof the matrix was written into 0..15
    // rather than the identity a never-called writer would leave behind.
    const block = Array.from(out.subarray(0, 16));
    expect(block.every(Number.isFinite)).toBe(true);
    expect(block.some((v) => v !== 0)).toBe(true);
  });
});
