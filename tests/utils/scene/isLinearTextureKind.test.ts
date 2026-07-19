import { describe, it, expect } from 'vitest';

import { isLinearTextureKind } from '../../../src/utils/scene/isLinearTextureKind';

describe('isLinearTextureKind', () => {
  // This predicate drives three consumers' correctness (filename extension,
  // fetcher decode, GPU texture format), so a wrong answer silently corrupts the
  // packed material channels — a real property worth pinning, not a constant
  // restatement. `material` is the only linear kind that ships today; the sRGB
  // colour kinds must stay linear-false so they keep their JPEG/sRGB path.
  it('classifies material as linear-packed data', () => {
    expect(isLinearTextureKind('material')).toBe(true);
  });

  it('classifies the sRGB colour kinds as non-linear', () => {
    expect(isLinearTextureKind('surface')).toBe(false);
    expect(isLinearTextureKind('night')).toBe(false);
    expect(isLinearTextureKind('clouds')).toBe(false);
  });
});
