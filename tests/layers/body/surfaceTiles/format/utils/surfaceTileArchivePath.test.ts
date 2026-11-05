import { describe, expect, it } from 'vitest';
import { surfaceTileArchivePath } from '../../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileArchivePath';

describe('surfaceTileArchivePath', () => {
  it('names index and parts', () => {
    expect(surfaceTileArchivePath('earth-tiles/v11', 'albedo', 13)).toBe(
      'earth-tiles/v11/albedo/z13.idx',
    );
    expect(surfaceTileArchivePath('earth-tiles/v11', 'height', 7, 1)).toBe(
      'earth-tiles/v11/height/z7.p1.pack',
    );
  });
});
