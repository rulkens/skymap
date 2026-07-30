/**
 * The runtime fetch surface is the spec: every name the browser's cloudLoader
 * requests must pass, and the legacy un-tiered build artefacts must stay out.
 * The upload loop shells out to wrangler, so this predicate is the testable
 * seam — given a correct allow-set the sweep is mechanical.
 */
import { describe, expect, it } from 'vitest';
import { allowDataFile } from '../../../../tools/deploy/r2/allowDataFile';

describe('allowDataFile', () => {
  it('accepts structures.ccat and structures_meta.json', () => {
    expect(allowDataFile('structures.ccat')).toBe(true);
    expect(allowDataFile('structures_meta.json')).toBe(true);
  });

  it('accepts famous_stars_meta.json', () => {
    expect(allowDataFile('famous_stars_meta.json')).toBe(true);
  });

  it('still rejects glade.bin / sdss.bin', () => {
    // Un-tiered legacy bins are offline DisPerSE inputs, never browser-fetched.
    expect(allowDataFile('glade.bin')).toBe(false);
    expect(allowDataFile('sdss.bin')).toBe(false);
  });

  it('accepts the tier-agnostic flowfield.scfd', () => {
    expect(allowDataFile('flowfield.scfd')).toBe(true);
  });

  it('rejects a tier-suffixed flowfield variant', () => {
    expect(allowDataFile('flowfield-large.scfd')).toBe(false);
    expect(allowDataFile('flowfield.bin')).toBe(false);
  });

  it('accepts the three tier-agnostic DESI patches', () => {
    expect(allowDataFile('desi-deep.bin')).toBe(true);
    expect(allowDataFile('desi-wedge.bin')).toBe(true);
    expect(allowDataFile('desi-sgw.bin')).toBe(true);
  });

  it('rejects tier-suffixed DESI variants', () => {
    // The patches are fixed regions, not tiered downsamples — there is no
    // per-tier variant, so a tier suffix must not slip through.
    expect(allowDataFile('desi-deep-large.bin')).toBe(false);
    expect(allowDataFile('desi-wedge-large.bin')).toBe(false);
    expect(allowDataFile('desi-sgw-large.bin')).toBe(false);
  });

  it('accepts stars-{small,medium,large}.bin and rejects stars-huge.bin', () => {
    // Exercises the regex's tier alternation, not just the filter list.
    expect(allowDataFile('stars-small.bin')).toBe(true);
    expect(allowDataFile('stars-medium.bin')).toBe(true);
    expect(allowDataFile('stars-large.bin')).toBe(true);
    expect(allowDataFile('stars-huge.bin')).toBe(false);
  });
});
