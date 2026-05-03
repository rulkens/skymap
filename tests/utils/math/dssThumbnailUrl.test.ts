import { describe, it, expect } from 'vitest';
import { dssThumbnailUrl } from '../../../src/utils/math/dssThumbnailUrl';

describe('dssThumbnailUrl', () => {
  it('builds the ESO DSS endpoint with default 2-arcmin field', () => {
    expect(dssThumbnailUrl(180, 0)).toBe(
      'https://archive.eso.org/dss/dss/image?ra=180&dec=0&x=2&y=2&Sky-Survey=DSS2-red&mime-type=image/jpeg',
    );
  });
  it('respects a custom arcmin field', () => {
    expect(dssThumbnailUrl(180, 0, 4)).toContain('x=4&y=4');
  });
});
