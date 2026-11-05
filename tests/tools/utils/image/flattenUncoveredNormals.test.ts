import { describe, expect, it } from 'vitest';
import { flattenUncoveredNormals } from '../../../../tools/utils/image/flattenUncoveredNormals';

describe('flattenUncoveredNormals', () => {
  it('flattens only the texels without coverage and leaves blue and alpha alone', () => {
    const rgba = new Uint8Array([10, 20, 255, 255, 30, 40, 250, 255]);
    flattenUncoveredNormals(rgba, new Uint8Array([1, 0]));
    expect([...rgba]).toEqual([10, 20, 255, 255, 128, 128, 250, 255]);
  });
});
