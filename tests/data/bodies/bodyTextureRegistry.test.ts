import { describe, it, expect } from 'vitest';
import {
  BODY_TEXTURE_REGISTRY,
  bodyTextureSpec,
} from '../../../src/data/bodies/bodyTextureRegistry';
import type { BodyTextureId } from '../../../src/@types/data/BodyTextureId';

describe('BODY_TEXTURE_REGISTRY', () => {
  it('structural invariants', () => {
    // The record is keyed by BodyTextureId and each row restates its own key in
    // `bodyId` (so a row can be passed around standalone). A key/value drift —
    // a copy-paste row left pointing at the wrong body — would silently texture
    // one body from another's tier/tint; nothing else catches it.
    for (const [key, spec] of Object.entries(BODY_TEXTURE_REGISTRY)) {
      expect(spec.bodyId).toBe(key);
    }

    // The day-map contract: every textured body must carry a `surface` kind — it
    // is the default map the fetcher, slot family, and residency checks all key
    // on. A row missing it would silently fail to texture that body.
    for (const spec of Object.values(BODY_TEXTURE_REGISTRY)) {
      expect(spec.kinds.surface).not.toBeUndefined();
    }

    // The registry-keyed union IS texture identity: a body is textured iff its id
    // keys the registry. `earth` is a member; `phobos` (an irregular moon) is not.
    expect(bodyTextureSpec('earth')).not.toBeNull();
    expect(bodyTextureSpec('phobos')).toBeNull();
    // A returned spec is the resident row, not a fresh object.
    const earth: BodyTextureId = 'earth';
    expect(bodyTextureSpec(earth)).toBe(BODY_TEXTURE_REGISTRY.earth);
  });
});
