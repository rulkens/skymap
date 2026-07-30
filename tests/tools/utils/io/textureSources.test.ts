import { describe, it, expect } from 'vitest';

import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/data/bodies/bodyTextureKeys';
import { TEXTURE_SOURCES } from '../../../../tools/utils/io/textureSources';

describe('TEXTURE_SOURCES', () => {
  // The drift-prevention invariant: the runtime family (every textured body +
  // ring) must be a subset of the table's `surface` sources. `satisfies
  // Record<…>` catches a missing top-level key, but `Partial<Record<TextureKind,
  // …>>` does NOT compiler-guarantee a `surface` entry exists — this closes that
  // gap. Add a textured body/ring, forget its source -> red here, not a silent
  // untextured render.
  it('every textured body/ring family key has a surface source', () => {
    for (const { bodyId } of ALL_BODY_TEXTURE_KEYS) {
      expect(TEXTURE_SOURCES[bodyId]?.surface?.native).toBeDefined();
    }
  });
});
