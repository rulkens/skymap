/**
 * AtmosphereUniforms WESL↔packer parity — nothing previously read the WGSL
 * struct itself, so a field reorder there would drift silently past
 * `packAtmosphereUniforms.test.ts` (which only re-asserts the packer's own
 * documented offsets) and corrupt every atmosphere draw. This parses `struct
 * AtmosphereUniforms` out of `sphere.wesl`, derives its std140 float offsets,
 * then drives the REAL packer with a distinct sentinel per field and asserts
 * each sentinel lands where the struct — not the packer — says it should.
 * Follows the `nodeParamsLayout.test.ts` precedent for locating/parsing the
 * struct and computing WGSL alignment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  packAtmosphereUniforms,
  ATMOSPHERE_UNIFORM_FLOATS,
} from '../../../src/utils/gpu/packAtmosphereUniforms';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const sphereWeslPath = resolve(repoRoot, 'src/services/gpu/shaders/lib/sphere.wesl');

/** std140 alignment + size for the subset AtmosphereUniforms uses. `lanes: 0`
 *  marks a type the packer never writes scalar-by-scalar (mat4x4) — its block
 *  offset still comes from this table, but is checked whole, not per-float,
 *  mirroring how the nodeParams precedent treats its opaque `CameraUniforms`. */
const WESL_TYPES: Record<string, { align: number; size: number; lanes: number }> = {
  f32: { align: 4, size: 4, lanes: 1 },
  'vec3<f32>': { align: 16, size: 12, lanes: 3 },
  'mat4x4<f32>': { align: 16, size: 64, lanes: 0 },
};

function roundUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

function structFields(source: string, name: string): Array<{ name: string; type: string }> {
  const body = source.match(new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) throw new Error(`struct ${name} not found in sphere.wesl`);
  return body
    .split(',')
    .map((line) => line.replace(/\/\/.*$/gm, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [fieldName, type] = line.split(':').map((part) => part.trim());
      if (!fieldName || !type) throw new Error(`unparsable AtmosphereUniforms field: '${line}'`);
      return { name: fieldName, type };
    });
}

type FieldLayout = { name: string; floatOffset: number; lanes: number };

/** Std140 layout, in declaration order, converted to float indices (every
 *  member here is 4-byte aligned, so bytes/4 is exact). */
function structLayout(fields: Array<{ name: string; type: string }>): {
  layout: FieldLayout[];
  totalFloats: number;
} {
  const layout: FieldLayout[] = [];
  let cursor = 0;
  let maxAlign = 4;
  for (const { name, type } of fields) {
    const spec = WESL_TYPES[type];
    if (!spec) throw new Error(`unhandled WESL type '${type}' on field ${name}`);
    const offset = roundUp(cursor, spec.align);
    layout.push({ name, floatOffset: offset / 4, lanes: spec.lanes });
    cursor = offset + spec.size;
    maxAlign = Math.max(maxAlign, spec.align);
  }
  return { layout, totalFloats: roundUp(cursor, maxAlign) / 4 };
}

describe('AtmosphereUniforms WESL/packer parity', () => {
  const sphereWesl = readFileSync(sphereWeslPath, 'utf8');
  const { layout, totalFloats } = structLayout(structFields(sphereWesl, 'AtmosphereUniforms'));

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

    const rec = packAtmosphereUniforms(
      mvp,
      invMvp,
      sunDirLocal,
      camPosLocal,
      bottomRadius,
      exposure,
      ringInnerRatio,
      ringOuterRatio,
    );

    const matrixByField: Record<string, Float32Array> = { mvp, invMvp };
    const vectorByField: Record<string, Vec3> = { sunDirLocal, camPosLocal };
    const scalarByField: Record<string, number> = {
      bottomRadius,
      exposure,
      ringInnerRatio,
      ringOuterRatio,
    };
    const zeroPadFields = new Set(['_pad1', '_pad0']);

    for (const field of layout) {
      if (field.lanes === 0) {
        const matrix = matrixByField[field.name];
        if (!matrix) throw new Error(`no sentinel matrix for field '${field.name}'`);
        for (let lane = 0; lane < 16; lane++)
          expect(rec[field.floatOffset + lane]).toBe(matrix[lane]);
      } else if (field.lanes === 3) {
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
