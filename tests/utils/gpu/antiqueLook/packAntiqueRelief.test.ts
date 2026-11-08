/**
 * packAntiqueRelief against `ReliefUniforms` (relief.wesl): every member lands at
 * its struct offset, the anchor split rebuilds the eye exactly enough to pin the
 * noise to the ground, and the uploaded inverse undoes the uploaded projection.
 */

import { describe, expect, it } from 'vitest';
import { mat4d, vec4d } from 'wgpu-matrix';

import { packAntiqueRelief } from '../../../../src/utils/gpu/antiqueLook/packAntiqueRelief';
import {
  ANTIQUE_RELIEF_ANCHOR_LOG2,
  ANTIQUE_RELIEF_BODIES,
  ANTIQUE_RELIEF_UNIFORM_BYTES,
} from '../../../../src/data/rendering/antiqueRelief';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';
import type { AntiqueReliefInput } from '../../../../src/@types/rendering/AntiqueReliefInput';

const SHADER = 'src/services/gpu/shaders/antiqueLook/relief.wesl';
const MARS_M = 3_390_000;
const MARS = ANTIQUE_RELIEF_BODIES['mars']!;

function input(eyeRelBodyM: [number, number, number]): AntiqueReliefInput {
  const view = mat4d.lookAt([0, 0, 0], [0.3, -0.2, -1], [0, 1, 0]);
  const proj = mat4d.perspective(0.8, 16 / 9, 2, 1e7);
  return {
    vp: mat4d.multiply(proj, view) as Float64Array,
    eyeRelBodyM,
    datumRadiusM: MARS_M,
    body: MARS,
    print: 2,
    reveal: 0.25,
    sun: [0, 0.6, 0.8],
    size: { width: 1600, height: 900 },
    unitPx: 1,
    radPerPx: 1e-3,
    lightElevationDeg: 18,
  };
}

describe('packAntiqueRelief', () => {
  it('writes ReliefUniforms member by member', () => {
    const { offsets, layout } = layoutWgslStruct(
      parseWgslStructFields(readShaderSource(SHADER), 'ReliefUniforms'),
      (type) => (type === 'vec3<i32>' ? { size: 12, align: 16 } : wgslPrimitiveLayout(type)!),
    );
    expect(layout.size).toBe(ANTIQUE_RELIEF_UNIFORM_BYTES);
    const at = (member: string) => offsets.get(member)! / 4;
    const eye: [number, number, number] = [1_200_345.25, -2_900_111.5, 1_400_007.75];
    const packed = packAntiqueRelief(input(eye));
    const f32 = new Float32Array(packed);
    expect(f32[at('eyeRelBody')]).toBe(Math.fround(eye[0]));
    expect(f32[at('sun') + 1]).toBe(Math.fround(0.6));
    expect(f32[at('radPerPx')]).toBe(Math.fround(1e-3));
    expect(f32[at('unit')]).toBe(1);
    expect([f32[at('res')], f32[at('res') + 1]]).toEqual([1600, 900]);
    expect(f32[at('lightSin')]! ** 2 + f32[at('lightCos')]! ** 2).toBeCloseTo(1, 6);
    // ~52 km up: all orbit, all the orbit exaggeration.
    expect(f32[at('orbit')]).toBe(1);
    expect(f32[at('exaggeration')]).toBe(MARS.exaggeration[1]);
    expect(f32[at('cellM')]).toBe(MARS.cellM);
    expect(f32[at('slopeInk')]).toBe(MARS.slopeInk);
    expect(f32[at('wideNormal')]).toBe(0);
    expect(f32[at('reveal')]).toBe(0.25);
    const earth = { ...input(eye), body: ANTIQUE_RELIEF_BODIES['earth']! };
    expect(new Float32Array(packAntiqueRelief(earth))[at('wideNormal')]).toBe(1);
    expect(f32[at('heightPeriodM')]).toBe(MARS.contourPeriodM);
    expect(new Float32Array(packAntiqueRelief(earth))[at('heightPeriodM')]).toBe(2048);
  });

  it('splits the eye into whole anchor cells and a small f32 remainder', () => {
    const eye: [number, number, number] = [1_200_345.25, -2_900_111.5, 1_400_007.75];
    const packed = packAntiqueRelief(input(eye));
    const f32 = new Float32Array(packed);
    const i32 = new Int32Array(packed);
    const cell = 2 ** ANTIQUE_RELIEF_ANCHOR_LOG2;
    for (let k = 0; k < 3; k++) {
      const remainder = f32[32 + k]!;
      expect(Math.abs(remainder)).toBeLessThanOrEqual(cell / 2);
      expect(Math.abs(i32[36 + k]! * cell + remainder - eye[k]!)).toBeLessThan(1e-3);
    }
  });

  it('fades from ground to orbit with altitude over the datum', () => {
    const at = (altitudeM: number) => {
      const f32 = new Float32Array(packAntiqueRelief(input([0, 0, MARS_M + altitudeM])));
      return [f32[35], f32[39]];
    };
    expect(at(-2_500)).toEqual([0, MARS.exaggeration[0]]);
    expect(at(46_000)).toEqual([1, MARS.exaggeration[1]]);
  });

  it('uploads an inverse that unprojects what the projection projects', () => {
    const relief = input([0, 0, MARS_M]);
    const f32 = new Float32Array(packAntiqueRelief(relief));
    const invVp = f32.slice(0, 16);
    const point = [120, -40, -900, 1];
    const clip = vec4d.transformMat4(point, relief.vp);
    const back = vec4d.transformMat4(clip, invVp);
    for (let k = 0; k < 3; k++) expect(Math.abs(back[k]! / back[3]! - point[k]!)).toBeLessThan(1e-4 * 900);
  });
});
