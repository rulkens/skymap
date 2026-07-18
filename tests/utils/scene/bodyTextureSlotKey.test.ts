import { describe, it, expect } from 'vitest';
import { bodyTextureSlotKey } from '../../../src/utils/scene/bodyTextureSlotKey';

describe('bodyTextureSlotKey', () => {
  it('joins body and kind with a colon', () => {
    // Hand-computed composite keys — the flat string the bodyTextures Map, the
    // AssetKey union, and the wiring row all agree on. The ring id contains a
    // '-', which is exactly why the separator is ':' and not '-'.
    expect(bodyTextureSlotKey('earth', 'surface')).toBe('earth:surface');
    expect(bodyTextureSlotKey('saturn-ring', 'surface')).toBe('saturn-ring:surface');
  });
});
