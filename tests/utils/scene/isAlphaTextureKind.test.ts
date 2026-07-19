import { describe, it, expect } from 'vitest';

import { isAlphaTextureKind } from '../../../src/utils/scene/isAlphaTextureKind';

describe('isAlphaTextureKind', () => {
  // This predicate drives the filename extension (an alpha kind must ship as PNG,
  // which JPEG cannot carry) — a wrong answer 404s the map at runtime. It is the
  // channel-count axis, orthogonal to isLinearTextureKind's precision axis: clouds
  // are sRGB COLOUR that also carry a transparency channel.
  it('classifies clouds as carrying alpha', () => {
    expect(isAlphaTextureKind('clouds')).toBe(true);
  });

  it('classifies the opaque kinds as not carrying alpha', () => {
    expect(isAlphaTextureKind('surface')).toBe(false);
    expect(isAlphaTextureKind('night')).toBe(false);
    expect(isAlphaTextureKind('material')).toBe(false);
    expect(isAlphaTextureKind('normal')).toBe(false);
  });
});
