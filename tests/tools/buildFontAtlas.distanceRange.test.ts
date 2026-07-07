import { describe, it, expect } from 'vitest';
import { DISTANCE_RANGE_PX } from '../../src/data/fonts';

describe('font atlas distance range', () => {
  it('bakes at distanceRange 32 so the SDF carries headroom for outline + glow', () => {
    // Headroom rationale: the outline fringe samples ~13.4 px past the
    // contour (0.16 em at the 84 px atlas em) and must stay inside the
    // SDF's encoded ±16 px.  The range must also scale with
    // ATLAS_FONT_SIZE: a larger range-to-em ratio shrinks the SDF
    // headroom of hairline strokes and bakes gaps into thin glyph parts.
    expect(DISTANCE_RANGE_PX).toBe(32);
  });
});
