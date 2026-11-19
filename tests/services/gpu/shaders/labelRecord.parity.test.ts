/**
 * labels/io.wesl `LabelRecord`, `LabelStyle`, `RecordUniforms` and their flag constants vs the
 * TS layouts that write them. A drift reads garbage on the GPU, silently.
 */
import { describe, expect, it } from 'vitest';
import {
  LABEL_RECORD,
  LABEL_RECORD_FLAGS,
  LABEL_RECORD_WORDS,
} from '../../../../src/data/labels/labelRecordLayout';
import {
  LABEL_STYLE_FLAGS,
  LABEL_STYLE_GPU,
  LABEL_STYLE_GPU_WORDS,
} from '../../../../src/data/labels/labelStyleGpuLayout';
import {
  LABEL_RECORD_UNIFORM_BYTES,
  LABEL_RECORD_UNIFORM_OFFSETS,
} from '../../../../src/data/labels/labelRecordUniformLayout';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { OUTPUT_PROJECTION_BYTES } from '../../../../src/services/gpu/lib/outputProjectionUniform';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const IO = 'src/services/gpu/shaders/labels/io.wesl';

function layoutOf(struct: string) {
  return layoutWgslStruct(parseWgslStructFields(readShaderSource(IO), struct), (type) =>
    type === 'OutputProjection'
      ? { size: OUTPUT_PROJECTION_BYTES, align: 16 }
      : wgslPrimitiveLayout(type)!,
  );
}

function wgslU32(name: string): number {
  const match = new RegExp(`const\\s+${name}\\s*:\\s*u32\\s*=\\s*(0x[0-9a-f]+|\\d+)u;`).exec(
    readShaderSource(IO),
  );
  return Number(match![1]);
}

function wgslF32(file: string, name: string): number {
  const match = new RegExp(`const\\s+${name}\\s*:\\s*f32\\s*=\\s*([0-9.e+-]+);`).exec(
    readShaderSource(`src/services/gpu/shaders/labels/${file}`),
  );
  return Number(match![1]);
}

describe('labels/io.wesl LabelRecord parity', () => {
  it('record layout matches io.wesl LabelRecord', () => {
    const { offsets, layout } = layoutWgslStruct(
      parseWgslStructFields(
        readShaderSource('src/services/gpu/shaders/labels/io.wesl'),
        'LabelRecord',
      ),
      (type) => wgslPrimitiveLayout(type)!,
    );
    const words = Object.fromEntries([...offsets].map(([name, bytes]) => [name, bytes / 4]));
    expect(words).toEqual(LABEL_RECORD);
    expect(layout.size).toBe(LABEL_RECORD_WORDS * 4);
  });

  it('style rows lay out as io.wesl LabelStyle', () => {
    const { offsets, layout } = layoutOf('LabelStyle');
    const words = Object.fromEntries([...offsets].map(([name, bytes]) => [name, bytes / 4]));
    expect(words).toEqual(LABEL_STYLE_GPU);
    expect(layout.size).toBe(LABEL_STYLE_GPU_WORDS * 4);
  });

  it('record uniforms lay out as io.wesl RecordUniforms', () => {
    const { offsets, layout } = layoutOf('RecordUniforms');
    const { output, ...rest } = LABEL_RECORD_UNIFORM_OFFSETS;
    expect(Object.fromEntries(offsets)).toEqual({ out: output, ...rest });
    expect(layout.size).toBe(LABEL_RECORD_UNIFORM_BYTES);
  });

  it('flag constants match the TS flags', () => {
    expect(wgslU32('STYLE_INDEX_MASK')).toBe(LABEL_RECORD_FLAGS.styleMask);
    expect(wgslU32('RECORD_GROUNDED')).toBe(LABEL_RECORD_FLAGS.grounded);
    expect(wgslU32('STYLE_ABOVE')).toBe(LABEL_STYLE_FLAGS.above);
    expect(wgslU32('STYLE_LEADER_FROM_RIM')).toBe(LABEL_STYLE_FLAGS.leaderFromRim);
    expect(wgslU32('STYLE_LEADER_COLOR')).toBe(LABEL_STYLE_FLAGS.leaderColor);
  });

  it('shader constants match their TS homes', () => {
    const mpcToKm = SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM;
    expect(wgslF32('vertexOcclude.wesl', 'MPC_TO_KM') / mpcToKm).toBeCloseTo(1, 12);
  });
});
