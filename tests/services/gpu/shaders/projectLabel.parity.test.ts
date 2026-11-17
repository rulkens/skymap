/**
 * lib/projectLabel.wesl vs its TS twins: the `OutputProjection` uniform against
 * the writer's byte offsets (each field a distinct sentinel), and both structs'
 * field names against the TS types. A drift reads garbage on the GPU, silently.
 */
import { describe, expect, it } from 'vitest';
import type { OutputProjection } from '../../../../src/@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../../../src/@types/rendering/ProjectedLabel';
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

// Every field's first word carries its own sentinel; kind 'pinhole' is code 0.
const projection: OutputProjection = {
  kind: 'pinhole',
  viewFromWorld: [101, 0, 0, 0, 1, 0, 0, 0, 1],
  camHi: [102, 0, 0],
  camLo: [103, 0, 0],
  up3: [104, 0, 0],
  sizePx: [105, 0],
  centrePx: [106, 0],
  focalPx: 107,
  pxScale: 108,
};
const SENTINEL: Readonly<Record<keyof OutputProjection, number>> = {
  kind: 0,
  viewFromWorld: 101,
  camHi: 102,
  camLo: 103,
  up3: 104,
  sizePx: 105,
  centrePx: 106,
  focalPx: 107,
  pxScale: 108,
};
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
      const word = AT + offset / 4;
      const value = name === 'kind' ? u32[word] : buf[word];
      expect(value, name).toBe(SENTINEL[name as keyof OutputProjection]);
    }
    // The mat3 columns' pad words are written, not left stale.
    expect([buf[AT + 3], buf[AT + 7], buf[AT + 11]]).toEqual([0, 0, 0]);
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
  });
});
