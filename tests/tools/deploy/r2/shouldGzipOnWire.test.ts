/**
 * The exclusion list is the load-bearing part: gzipping an already-compressed
 * format wastes upload CPU for no size win (see the docblock's measured
 * ratios), so a regression here would silently re-introduce that waste.
 */
import { describe, expect, it } from 'vitest';
import { shouldGzipOnWire } from '../../../../tools/deploy/r2/shouldGzipOnWire';

describe('shouldGzipOnWire', () => {
  it('excludes stars-{small,medium,large}.bin', () => {
    expect(shouldGzipOnWire('stars-small.bin')).toBe(false);
    expect(shouldGzipOnWire('stars-medium.bin')).toBe(false);
    expect(shouldGzipOnWire('stars-large.bin')).toBe(false);
  });

  it('excludes flowfield.scfd and tier-suffixed variants', () => {
    expect(shouldGzipOnWire('flowfield.scfd')).toBe(false);
    expect(shouldGzipOnWire('flowfield-large.scfd')).toBe(false);
  });

  it('includes other .bin/.scfd/.ccat/.json data files', () => {
    expect(shouldGzipOnWire('sdss-medium.bin')).toBe(true);
    expect(shouldGzipOnWire('mcpm-large.scfd')).toBe(true);
    expect(shouldGzipOnWire('structures.ccat')).toBe(true);
    expect(shouldGzipOnWire('pgc_aliases.json')).toBe(true);
  });

  it('matches by basename, so a nested epoch-folder path still excludes correctly', () => {
    expect(shouldGzipOnWire('star-catalog/v1/stars-small.bin')).toBe(false);
    expect(shouldGzipOnWire('galaxy-catalog/v9/2mrs.bin')).toBe(true);
  });

  it('rejects an unrelated extension (e.g. an image)', () => {
    expect(shouldGzipOnWire('thumb.jpg')).toBe(false);
  });
});
