/**
 * lib/projectLabel.wesl vs its TS twins: the `OutputProjection` uniform against
 * the writer's byte offsets (each field a distinct sentinel), and both structs'
 * field names against the TS types. A drift reads garbage on the GPU, silently.
 */
import { describe, expect, it } from 'vitest';
import type { OutputProjection } from '../../../../src/@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../../../src/@types/rendering/ProjectedLabel';
import { LIFT_ZENITH_MARGIN_RAD } from '../../../../src/data/labels/liftZenithMarginRad';
import { PARALLEL_TANGENT_EPS } from '../../../../src/data/labels/parallelTangentEps';
import {
  OUTPUT_PROJECTION_BYTES,
  writeOutputProjection,
} from '../../../../src/services/gpu/lib/outputProjectionUniform';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const source = readShaderSource('src/services/gpu/shaders/lib/projectLabel.wesl');

// Every component of every field carries its own sentinel (kind 'pinhole' is code 0),
// so a swapped pair of components inside one field fails too.
const projection: OutputProjection = {
  kind: 'pinhole',
  viewFromWorld: [101, 102, 103, 104, 105, 106, 107, 108, 109],
  camHi: [110, 111, 112],
  camLo: [113, 114, 115],
  up3: [116, 117, 118],
  sizePx: [119, 120],
  centrePx: [121, 122],
  focalPx: 123,
  pxScale: 124,
};
/** The words each field occupies from its offset; a mat3's columns sit 4 words apart. */
function expectedWords(name: keyof OutputProjection): readonly number[] {
  const value = projection[name];
  if (name === 'viewFromWorld') {
    const m = value as readonly number[];
    return [m[0]!, m[1]!, m[2]!, NaN, m[3]!, m[4]!, m[5]!, NaN, m[6]!, m[7]!, m[8]!];
  }
  return typeof value === 'number' ? [value] : (value as readonly number[]);
}
const projected: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };

describe('lib/projectLabel.wesl parity', () => {
  it('OutputProjection uniform layout matches the TS writer', () => {
    const { offsets, layout } = layoutWgslStruct(
      parseWgslStructFields(source, 'OutputProjection'),
      (type) => wgslPrimitiveLayout(type)!,
    );
    expect(layout.size).toBe(OUTPUT_PROJECTION_BYTES);
    // Written at a non-zero f32 index, as a renderer's uniform tail would.
    const AT = 8;
    const buf = new Float32Array(AT + OUTPUT_PROJECTION_BYTES / 4).fill(-1);
    writeOutputProjection(buf, AT, projection);
    const u32 = new Uint32Array(buf.buffer);
    for (const [name, offset] of offsets) {
      if (name === 'kind') {
        expect(u32[AT + offset / 4], name).toBe(0);
        continue;
      }
      expectedWords(name as keyof OutputProjection).forEach((want, k) => {
        if (!Number.isNaN(want)) expect(buf[AT + offset / 4 + k], `${name}[${k}]`).toBe(want);
      });
    }
    // The mat3 columns' pad words are written, not left stale.
    expect([buf[AT + 3], buf[AT + 7], buf[AT + 11]]).toEqual([0, 0, 0]);
  });

  it('the kind codes the writer packs are the constants the shader branches on', () => {
    const wgslCode = (name: string) =>
      Number(new RegExp(`const\\s+${name}\\s*:\\s*u32\\s*=\\s*(\\d+)u\\s*;`).exec(source)![1]);
    const written = (kind: OutputProjection['kind']) => {
      const buf = new Float32Array(OUTPUT_PROJECTION_BYTES / 4);
      writeOutputProjection(buf, 0, { ...projection, kind });
      return new Uint32Array(buf.buffer)[92 / 4];
    };
    expect(written('pinhole')).toBe(wgslCode('KIND_PINHOLE'));
    expect(written('equidistant')).toBe(wgslCode('KIND_EQUIDISTANT'));
    expect(wgslCode('KIND_EQUIDISTANT')).not.toBe(wgslCode('KIND_PINHOLE'));
  });

  it('the fisheye branch is taken on the equidistant code and measures its angle with atan2', () => {
    expect(source).toMatch(/projection\.kind\s*==\s*KIND_EQUIDISTANT/);
    expect(source).toMatch(/\batan2\s*\(/);
    expect(source).not.toMatch(/\bacos\s*\(/);
  });

  it("the card's hand and its zenith fallback are labelCornerPx.ts's", () => {
    // TS: right = cross(cardUp, dir), fallback up (0, 0, −1); a swap mirrors every dome label.
    const body = /fn labelCornerPx\([\s\S]*?\n}/.exec(source)![0];
    expect(body).toMatch(/cross\(cardUp,\s*dir\)/);
    expect(body).toMatch(/cardUp = vec3<f32>\(0\.0, 0\.0, -1\.0\)/);
    expect(body).toMatch(/across \* offsetPx\.x \+ anchor\.up \* offsetPx\.y/);
    expect(source).toMatch(/fn unprojectLabel\(/);
  });

  it('projectLabel.wesl names the same fields as projectLabel.ts', () => {
    const names = (struct: string) =>
      parseWgslStructFields(source, struct)
        .map((f) => f.name)
        .sort();
    expect(names('OutputProjection')).toEqual(Object.keys(projection).sort());
    expect(names('ProjectedLabel')).toEqual(Object.keys(projected).sort());
    const eps = /const\s+PARALLEL_TANGENT_EPS\s*:\s*f32\s*=\s*([0-9.e-]+)\s*;/.exec(source);
    expect(Number(eps![1])).toBe(PARALLEL_TANGENT_EPS);
    const margin = /const\s+LIFT_ZENITH_MARGIN_RAD\s*:\s*f32\s*=\s*([0-9.e-]+)\s*;/.exec(source);
    expect(Number(margin![1])).toBe(LIFT_ZENITH_MARGIN_RAD);
  });
});
