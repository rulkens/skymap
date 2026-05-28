import { describe, it, expect } from 'vitest';
import { DISTANCE_RANGE_PX } from '../../src/data/fonts';

describe('font atlas distance range', () => {
  it('bakes at distanceRange 16 so the SDF carries headroom for outline + glow', () => {
    // Headroom rationale: the up-to-12-px glow extent at maxPixelSize plus
    // ~2 px of outline must stay inside the SDF's encoded range.  4 (the
    // msdf-bmfont-xml default) clamped the falloff tail; 16 leaves ~25%
    // margin past the worst-case effect extent.
    expect(DISTANCE_RANGE_PX).toBe(16);
  });
});
