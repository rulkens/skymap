/**
 * labels/io.wesl `LabelRecord` vs `LABEL_RECORD`, the word offsets `writeLabelRecord` writes.
 * A drift reads garbage on the GPU, silently.
 */
import { describe, expect, it } from 'vitest';
import { LABEL_RECORD, LABEL_RECORD_WORDS } from '../../../../src/data/labels/labelRecordLayout';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

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
});
