import { describe, it, expect } from 'vitest';
import { assertAtlasDimensions } from '../../tools/fonts/buildFontAtlas';
import { ATLAS_PX } from '../../src/data/fonts';

describe('assertAtlasDimensions', () => {
  it('accepts a PNG with the expected square dimensions', () => {
    // The function takes (fontId, width, height) and throws if either
    // dimension is wrong.  Passing ATLAS_PX, ATLAS_PX should silently
    // return.
    expect(() => assertAtlasDimensions('cormorant', ATLAS_PX, ATLAS_PX)).not.toThrow();
  });

  it('throws with the font id when width overflows', () => {
    // msdf-bmfont-xml silently grows the atlas if the charset overflows
    // the requested page size.  Catching that requires knowing the
    // emitted dimensions and screaming loudly with the font id so the
    // engineer knows which charset to shrink (or which atlas to grow).
    expect(() => assertAtlasDimensions('cormorant', 2048, ATLAS_PX)).toThrow(/cormorant/);
    expect(() => assertAtlasDimensions('cormorant', 2048, ATLAS_PX)).toThrow(/2048/);
  });

  it('throws with the font id when height overflows', () => {
    expect(() => assertAtlasDimensions('cormorant', ATLAS_PX, 2048)).toThrow(/cormorant/);
  });

  it('mentions both expected and actual dimensions in the error', () => {
    // The engineer reading the failure needs to see which dimension is
    // wrong and by how much.
    expect(() => assertAtlasDimensions('cormorant', 2048, 768)).toThrow(
      /1024/, // expected
    );
  });
});
