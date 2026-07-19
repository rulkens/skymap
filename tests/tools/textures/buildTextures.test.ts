import { describe, it, expect } from 'vitest';

import { BODY_TEXTURE_REGISTRY } from '../../../src/data/bodies/bodyTextureRegistry';
import { textureBuildEntries } from '../../../tools/textures/buildTextures';
import { TEXTURE_SOURCES } from '../../../tools/utils/io/textureSources';

/** `bodyId:kind` — the comparable identity of one build work item. */
function keyOf(bodyId: string, kind: string): string {
  return `${bodyId}:${kind}`;
}

describe('textureBuildEntries', () => {
  // Drift guard for the (body, kind) rewire: the build's per-body-per-kind work
  // list must cover every NON-RING (body, kind) authored in TEXTURE_SOURCES. The
  // ring is excluded — it carries only `surface`, is not registry-driven
  // (`emittedTiersForBody` indexes BODY_TEXTURE_REGISTRY, which has no ring row),
  // and rides its own loop. This passes today (every kind is `surface`) and goes
  // red the moment a body gains a non-surface map on one side (the registry
  // `kinds` or the TEXTURE_SOURCES row) but not the other — the coupling this
  // rewire exists to keep honest.
  it('covers every non-ring (body,kind) in TEXTURE_SOURCES', () => {
    const expected = new Set<string>();
    for (const [bodyId, kinds] of Object.entries(TEXTURE_SOURCES)) {
      // Rings are the TEXTURE_SOURCES keys with no BODY_TEXTURE_REGISTRY row.
      if (!(bodyId in BODY_TEXTURE_REGISTRY)) continue;
      for (const kind of Object.keys(kinds)) {
        expected.add(keyOf(bodyId, kind));
      }
    }

    const actual = new Set(textureBuildEntries().map((e) => keyOf(e.bodyId, e.kind)));
    expect(actual).toEqual(expected);
  });
});
