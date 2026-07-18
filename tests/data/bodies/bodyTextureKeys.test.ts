import { describe, it, expect } from 'vitest';
import { ALL_BODY_TEXTURE_KEYS } from '../../../src/data/bodies/bodyTextureKeys';
import { BODY_TEXTURE_REGISTRY } from '../../../src/data/bodies/bodyTextureRegistry';
import { SCENE_RINGS } from '../../../src/data/bodies/sceneRings';

describe('ALL_BODY_TEXTURE_KEYS', () => {
  it('enumerates one surface entry per textured body plus the ring', () => {
    // Today every body carries only a `surface` map, so every enumerated entry
    // is `surface` — a body that grew an extra kind without its registry row
    // gaining it (or vice versa) would break this.
    for (const entry of ALL_BODY_TEXTURE_KEYS) {
      expect(entry.kind).toBe('surface');
    }

    // Structural invariant: the enumerated bodyIds are exactly the registry keys
    // ∪ the ring texture ids. Catches a body dropped from (or wrongly added to)
    // the enumeration without restating the count.
    const bodyIds = new Set(ALL_BODY_TEXTURE_KEYS.map((e) => e.bodyId));
    const expected = new Set<string>([
      ...Object.keys(BODY_TEXTURE_REGISTRY),
      ...SCENE_RINGS.map((r) => r.textureId),
    ]);
    expect(bodyIds).toEqual(expected);
  });
});
