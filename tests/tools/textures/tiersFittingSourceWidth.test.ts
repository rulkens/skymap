/**
 * Tests for tiersFittingSourceWidth — the source-cap half of the build's tier
 * decision: which tiers a source image can produce without upscaling.
 *
 * This is the dev-build correctness core. The intersection of this with
 * `emittedTiersForBody` is what makes a `--dev` fetch (only 2 k SSS files + the
 * 5400×2700 NASA Earth sibling on disk) build the right — and only the right —
 * tiers. The cases pin the two boundary widths that actually occur in a dev
 * build plus the full-source case; the rule that can break is "never emit a tier
 * wider than the source".
 */

import { describe, expect, it } from 'vitest';
import { tiersFittingSourceWidth } from '../../../tools/textures/tiersFittingSourceWidth';

describe('tiersFittingSourceWidth', () => {
  it('caps a 2048-wide dev source to the small tier only', () => {
    expect(tiersFittingSourceWidth(2048)).toEqual(['small']);
  });

  it('lets the 5400x2700 Earth dev source make small + medium but not large', () => {
    expect(tiersFittingSourceWidth(5400)).toEqual(['small', 'medium']);
  });

  it('lets a native 8k+ source make all three tiers', () => {
    expect(tiersFittingSourceWidth(8192)).toEqual(['small', 'medium', 'large']);
    expect(tiersFittingSourceWidth(11445)).toEqual(['small', 'medium', 'large']);
  });
});
