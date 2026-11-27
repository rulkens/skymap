/**
 * TS↔WESL parity: `lib/sceneCamera.wesl`'s `SceneCamera` struct — the one every
 * scene shader imports — vs. what `writeSceneCamera` actually writes. The
 * expected indices are PARSED from the shader (WGSL alignment rules applied, so
 * a reordered struct is modelled correctly) and the writer is EXECUTED against
 * them with a distinct sentinel per field — a literal-vs-literal test would stay
 * green while the two halves drifted apart, and a drifted offset is invisible
 * until the frame stops presenting.
 * Mirrors `packages/mcpm-workbench/tests/src/render/mcpmCamera.parity.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { SceneCameraView } from '../../../../../tools/scene-workbench/src/render/sceneCameraView';
import {
  SCENE_CAMERA_BYTES,
  writeSceneCamera,
} from '../../../../../tools/scene-workbench/src/render/writeSceneCamera';
import { weslStructLayout } from '../../../../helpers/wesl/weslStructLayout';

// One distinct value per field, so a field written to a neighbour's slot shows up
// as a wrong number rather than a coincidence. `upM` doubles as `lookAt`'s up and
// so must not be parallel to eye→target, or the view matrix comes back all-NaN.
const RIGHT_M = [11, 12, 13] as const;
const UP_M = [21, -22, 23] as const;
const EYE_M = [31, 32, 33] as const;
const POINT_SIZE_PX = 42;
const SPLAT_SCALE = 0.75;
const OPACITY_SCALE = 0.375;
const VIEWPORT_PX = [1600, 900] as const;
const FOV_Y_RAD = Math.PI / 4;

const VIEW: SceneCameraView = {
  eyeM: [...EYE_M],
  targetM: [0, 0, 0],
  rightM: [...RIGHT_M],
  upM: [...UP_M],
  projection: { kind: 'perspective', fovYRad: FOV_Y_RAD, nearM: 0.5, farM: 5000 },
  viewportPx: VIEWPORT_PX,
};

describe('SceneCamera TS↔WESL parity (lib/sceneCamera.wesl ↔ writeSceneCamera.ts)', () => {
  const text = readFileSync(
    join(process.cwd(), 'tools/scene-workbench/src/render/shaders/lib/sceneCamera.wesl'),
    'utf-8',
  );
  const { fields, size: sizeBytes } = weslStructLayout(text, 'SceneCamera', 'uniform');
  const floatOffsets = new Map(fields.map((field) => [field.name, field.offset / 4]));

  const out = new Float32Array(SCENE_CAMERA_BYTES / 4);
  writeSceneCamera(out, VIEW, POINT_SIZE_PX, SPLAT_SCALE, OPACITY_SCALE);

  const at = (field: string): number => {
    const offset = floatOffsets.get(field);
    if (offset === undefined) throw new Error(`sceneCamera.wesl has no field ${field}`);
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
    expect(out[at('viewportW')]).toBe(VIEWPORT_PX[0]);
    expect(vec3At('eyeM')).toEqual([...EYE_M]);
    // Metres per pixel per metre of depth — the shader scales it by the clip w.
    // `Math.fround`: the store into a Float32Array is the only rounding here.
    expect(out[at('metresPerPx')]).toBe(
      Math.fround((2 * Math.tan(FOV_Y_RAD / 2)) / VIEWPORT_PX[1]),
    );
    expect(out[at('splatScale')]).toBe(SPLAT_SCALE);
    expect(out[at('opacityScale')]).toBe(OPACITY_SCALE);
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

  it('view is a projection-free matrix of its own, not a second copy of viewProj', () => {
    const block = Array.from(out.subarray(at('view'), at('view') + 16));
    expect(block.every(Number.isFinite)).toBe(true);
    expect(block.some((v) => v !== 0)).toBe(true);
    // The splat pass transports covariance into CAMERA space; writing viewProj
    // here would fold the projection in twice and pass every other check.
    expect(block).not.toEqual(Array.from(out.subarray(0, 16)));
    // Only a view matrix maps the eye to the camera origin — the property that
    // separates it from the projection, which the finite/non-zero/differs trio
    // cannot: column-major, so column c is block[4 * c + r].
    const [ex, ey, ez] = EYE_M;
    for (let r = 0; r < 3; r++) {
      expect(block[r]! * ex + block[4 + r]! * ey + block[8 + r]! * ez + block[12 + r]!).toBeCloseTo(
        0,
        4,
      );
    }
  });
});
