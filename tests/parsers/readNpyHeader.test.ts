import { describe, expect, it } from 'vitest';
import { readNpyHeader } from '../../tools/parsers/readNpyHeader';
import { writeNpy } from '../../tools/parsers/npyWriter';

describe('readNpyHeader', () => {
  const file = new Uint8Array(writeNpy(new Float32Array(24), [2, 3, 4], '<f4'));

  it('reads dtype, shape and data offset from the header alone', () => {
    const { dataOffset } = readNpyHeader(file);
    const header = readNpyHeader(file.subarray(0, dataOffset));
    expect(header).toEqual({ dtype: '<f4', shape: [2, 3, 4], dataOffset: file.length - 96 });
    expect(header.dataOffset % 64).toBe(0);
  });

  it('too few bytes for the header throws', () => {
    expect(() => readNpyHeader(file.subarray(0, 40))).toThrow(/too few bytes/);
  });
});
