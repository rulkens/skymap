/**
 * parseLonLatInput — the fly-to-coordinates text box's parse. Covers the
 * comma/space-separated plain-number case (the primary contract), the
 * optional degree+compass-letter bonus, and the "ignore, don't throw"
 * contract for unparseable input.
 */
import { describe, it, expect } from 'vitest';

import { parseLonLatInput } from '../../../src/utils/scene/parseLonLatInput';

describe('parseLonLatInput', () => {
  it('parses comma-separated lon, lat', () => {
    expect(parseLonLatInput('12.53, 55.67')).toEqual({ lonDeg: 12.53, latDeg: 55.67 });
  });

  it('parses whitespace-separated lon lat', () => {
    expect(parseLonLatInput('12.53 55.67')).toEqual({ lonDeg: 12.53, latDeg: 55.67 });
  });

  it('parses negative coordinates', () => {
    expect(parseLonLatInput('-73.97, 40.78')).toEqual({ lonDeg: -73.97, latDeg: 40.78 });
  });

  it('parses degree + compass-letter suffixes, negating W/S', () => {
    expect(parseLonLatInput('12.53°E, 55.67°N')).toEqual({ lonDeg: 12.53, latDeg: 55.67 });
    expect(parseLonLatInput('73.97W 40.78S')).toEqual({ lonDeg: -73.97, latDeg: -40.78 });
  });

  it('tolerates extra surrounding whitespace and repeated separators', () => {
    expect(parseLonLatInput('  12.53,   55.67  ')).toEqual({ lonDeg: 12.53, latDeg: 55.67 });
  });

  it('returns null for unparseable input rather than throwing', () => {
    expect(parseLonLatInput('')).toBeNull();
    expect(parseLonLatInput('not a coordinate')).toBeNull();
    expect(parseLonLatInput('12.53')).toBeNull();
    expect(parseLonLatInput('12.53, 55.67, 99')).toBeNull();
  });
});
