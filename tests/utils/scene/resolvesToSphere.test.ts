/**
 * resolvesToSphere — unit tests for the star LOD partition predicate.
 *
 * The predicate is deliberately downstream of `apparentSizePx` (whose
 * projection math has its own tests), so it needs no camera or body record:
 * feed it an already-computed apparent size and it just applies the threshold
 * plus the always-resolved override. The boundary case is pinned to match the
 * famous-galaxy gate's `<` convention (`produceFamousGalaxyLabels.ts:221`), where
 * exactly-at-threshold promotes rather than staying a point.
 */

import { describe, it, expect } from 'vitest';

import { resolvesToSphere } from '../../../src/utils/scene/resolvesToSphere';

describe('resolvesToSphere', () => {
  it('resolvesToSphere is true above the threshold', () => {
    expect(resolvesToSphere({ apparentSizePx: 4.1, thresholdPx: 4, alwaysResolved: false })).toBe(
      true,
    );
  });

  it('resolvesToSphere is false below the threshold', () => {
    expect(resolvesToSphere({ apparentSizePx: 3.9, thresholdPx: 4, alwaysResolved: false })).toBe(
      false,
    );
  });

  it('resolvesToSphere is true at exactly the threshold', () => {
    // Pin the boundary: equal promotes to a sphere, matching the famous-gate's
    // `sizePx < threshold → continue` convention.
    expect(resolvesToSphere({ apparentSizePx: 4, thresholdPx: 4, alwaysResolved: false })).toBe(
      true,
    );
  });

  it('resolvesToSphere is true when alwaysResolved regardless of size', () => {
    // The degenerate camera-on-the-star case: apparentSizePx's distance<=0
    // guard reports 0, and the override keeps the star the camera is inside
    // resolved.
    expect(resolvesToSphere({ apparentSizePx: 0, thresholdPx: 4, alwaysResolved: true })).toBe(
      true,
    );
  });
});
