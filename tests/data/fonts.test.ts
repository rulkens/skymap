import { describe, it, expect } from 'vitest';
import {
  ATLAS_PX,
  DISTANCE_RANGE_PX,
  ATLAS_FONT_SIZE,
  FONTS,
} from '../../src/data/fonts';

describe('font registry', () => {
  it('exposes the shared atlas envelope constants', () => {
    // These numbers must agree between the bake (tools/buildFontAtlas.ts)
    // and the runtime (loadFontAtlases.ts).  Hard-coding them in two
    // places was the original sin the registry eliminates.
    expect(ATLAS_PX).toBe(1024);
    expect(DISTANCE_RANGE_PX).toBe(32);
    expect(ATLAS_FONT_SIZE).toBe(84);
  });

  it('registers cormorant with a TTF filename and a charset', () => {
    expect(FONTS.cormorant).toBeDefined();
    expect(FONTS.cormorant.ttf).toBe('CormorantGaramond-SemiBold.ttf');
    expect(FONTS.cormorant.charset.length).toBeGreaterThan(90);
    // ASCII printable space (32) through tilde (126) = 95 chars,
    // plus the three unit symbols °±µ.
    expect(FONTS.cormorant.charset.length).toBe(95 + 3);
  });

  it('includes degree, plus-minus, and micro in the charset', () => {
    expect(FONTS.cormorant.charset).toContain('°');
    expect(FONTS.cormorant.charset).toContain('±');
    expect(FONTS.cormorant.charset).toContain('µ');
  });
});
