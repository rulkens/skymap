import { describe, it, expect } from 'vitest';
import { ALL_BODY_TEXTURE_KEYS } from '../../../src/data/bodies/bodyTextureKeys';
import { BODY_TEXTURE_REGISTRY } from '../../../src/data/bodies/bodyTextureRegistry';
import { SCENE_RINGS } from '../../../src/data/bodies/sceneRings';

describe('ALL_BODY_TEXTURE_KEYS', () => {
  it("enumerates each body's registry kinds plus one surface entry per ring", () => {
    // Every non-ring entry must carry a kind that body actually declares in its
    // registry `kinds` — a stray kind (or one dropped from the enumeration)
    // breaks this. Rings are not registry-driven and carry only `surface`.
    const registry = BODY_TEXTURE_REGISTRY as Record<
      string,
      { kinds: Record<string, unknown> } | undefined
    >;
    for (const { bodyId, kind } of ALL_BODY_TEXTURE_KEYS) {
      const spec = registry[bodyId];
      if (spec) {
        expect(spec.kinds[kind]).toBeDefined();
      } else {
        expect(kind).toBe('surface');
      }
    }

    // Earth is the first body to carry a second kind — its `material` map must be
    // enumerated alongside `surface`, not silently dropped from the slot family.
    const earthKinds = ALL_BODY_TEXTURE_KEYS.filter((e) => e.bodyId === 'earth').map((e) => e.kind);
    expect(earthKinds).toContain('surface');
    expect(earthKinds).toContain('material');

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
