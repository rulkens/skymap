/**
 * AtmosphereUniforms WESL↔packer parity: `packAtmosphereUniforms.test.ts` only re-asserts the
 * packer's own offsets, so a field reorder in the WGSL struct would drift silently and corrupt every
 * atmosphere draw. This lays out `struct AtmosphereUniforms` from `sphere.wesl`, drives the REAL
 * packer with a distinct sentinel per field, and asserts each lands where the struct, not the
 * packer, says it should.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  packAtmosphereUniforms,
  ATMOSPHERE_UNIFORM_FLOATS,
} from '../../../../../src/layers/body/atmosphere/render/packAtmosphereUniforms';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { weslStructLayout } from '../../../../helpers/wesl/weslStructLayout';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const sphereWeslPath = resolve(repoRoot, 'src/services/gpu/shaders/lib/sphere.wesl');

describe('AtmosphereUniforms WESL/packer parity', () => {
  const sphereWesl = readFileSync(sphereWeslPath, 'utf8');
  const struct = weslStructLayout(sphereWesl, 'AtmosphereUniforms', 'uniform');
  const totalFloats = struct.size / 4;

  it('struct float count matches ATMOSPHERE_UNIFORM_FLOATS', () => {
    expect(totalFloats).toBe(ATMOSPHERE_UNIFORM_FLOATS);
  });

  it('the real packer writes each field at the offset the struct declares', () => {
    // One non-overlapping sentinel per field, so a swap between any two
    // fields — or a packer that missed the WESL's reorder — lands a
    // recognisable value at the WRONG offset instead of matching by luck.
    const mvp = Float32Array.from({ length: 16 }, (_, i) => i + 1); // 1..16
    const invMvp = Float32Array.from({ length: 16 }, (_, i) => i + 101); // 101..116
    const sunDirLocal: Vec3 = [201, 202, 203];
    const camPosLocal: Vec3 = [301, 302, 303];
    const bottomRadius = 401;
    const exposure = 402;
    const ringInnerRatio = 403;
    const ringOuterRatio = 404;
    const froxelSliceKm = 405;
    const daylight = 406;

    const rec = packAtmosphereUniforms(
      mvp,
      invMvp,
      sunDirLocal,
      camPosLocal,
      bottomRadius,
      exposure,
      ringInnerRatio,
      ringOuterRatio,
      froxelSliceKm,
      daylight,
    );

    const matrixByField: Record<string, Float32Array> = { mvp, invMvp };
    const vectorByField: Record<string, Vec3> = { sunDirLocal, camPosLocal };
    const scalarByField: Record<string, number> = {
      bottomRadius,
      exposure,
      ringInnerRatio,
      ringOuterRatio,
      froxelSliceKm,
      daylight,
    };
    const zeroPadFields = new Set<string>();

    for (const { name, type, offset } of struct.fields) {
      const field = { name, floatOffset: offset / 4 };
      if (type === 'mat4x4<f32>') {
        const matrix = matrixByField[field.name];
        if (!matrix) throw new Error(`no sentinel matrix for field '${field.name}'`);
        for (let lane = 0; lane < 16; lane++)
          expect(rec[field.floatOffset + lane]).toBe(matrix[lane]);
      } else if (type === 'vec3<f32>') {
        const vec = vectorByField[field.name];
        if (!vec) throw new Error(`no sentinel vector for field '${field.name}'`);
        for (let lane = 0; lane < 3; lane++) expect(rec[field.floatOffset + lane]).toBe(vec[lane]);
      } else if (zeroPadFields.has(field.name)) {
        expect(rec[field.floatOffset]).toBe(0);
      } else {
        const value = scalarByField[field.name];
        if (value === undefined) throw new Error(`no sentinel for field '${field.name}'`);
        expect(rec[field.floatOffset]).toBe(value);
      }
    }
  });
});
