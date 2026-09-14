import { describe, it, expect } from 'vitest';
import { overflowFade } from '../../../src/utils/scene/overflowFade';

// The three regimes of the one "the subject outgrew the screen" rule, phrased
// in fractions of the viewport's short side so nothing here restates the
// helper's band edges.
describe('overflowFade', () => {
  const SHORT_SIDE = 1000;

  it('leaves an overlay at full strength while its subject is small on screen', () => {
    expect(overflowFade(0, SHORT_SIDE)).toBe(1);
    expect(overflowFade(SHORT_SIDE / 4, SHORT_SIDE)).toBe(1);
  });

  it('is gone once the subject itself fills the short side', () => {
    // At this size the 1.5× overlay is half a screen wider than the viewport —
    // the regime a mesh body's two-radii standoff sits permanently inside.
    expect(overflowFade(SHORT_SIDE, SHORT_SIDE)).toBe(0);
  });
});
