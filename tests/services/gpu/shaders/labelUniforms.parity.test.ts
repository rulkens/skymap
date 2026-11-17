/**
 * labels/io.wesl `Uniforms` vs the offsets labelRenderer writes. A drift reads
 * garbage on the GPU, silently.
 */
import { describe, expect, it } from 'vitest';
import { LABEL_UNIFORM_BYTES } from '../../../../src/data/labels/labelUniformBytes';
import { LABEL_UNIFORM_OFFSETS } from '../../../../src/data/labels/labelUniformOffsets';
import { OUTPUT_PROJECTION_BYTES } from '../../../../src/services/gpu/lib/outputProjectionUniform';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

describe('labels/io.wesl Uniforms parity', () => {
  it('lays out where labelRenderer writes it', () => {
    const { offsets, layout } = layoutWgslStruct(
      parseWgslStructFields(
        readShaderSource('src/services/gpu/shaders/labels/io.wesl'),
        'Uniforms',
      ),
      (type) =>
        type === 'OutputProjection'
          ? { size: OUTPUT_PROJECTION_BYTES, align: 16 }
          : wgslPrimitiveLayout(type)!,
    );
    expect(Object.fromEntries(offsets)).toEqual({
      out: LABEL_UNIFORM_OFFSETS.output,
      viewFromSlab: LABEL_UNIFORM_OFFSETS.viewFromSlab,
      nearClipMpc: LABEL_UNIFORM_OFFSETS.nearClipMpc,
    });
    expect(layout.size).toBe(LABEL_UNIFORM_BYTES);
  });
});
