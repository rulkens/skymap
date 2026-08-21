/**
 * Unit tests for `sdssNavigateUrl` — pure URL builder for the SDSS Navigate
 * external sky viewer.
 *
 * Validates URL shape, param values, and the 512px-viewport scale math that
 * frames the viewer the same as the InfoCard thumbnail's field of view.
 */

import { describe, it, expect } from 'vitest';
import { sdssNavigateUrl } from '../../../src/utils/math/sdssNavigateUrl';

describe('sdssNavigateUrl', () => {
  it('builds the canonical DR18 Navigate URL', () => {
    // Pinning the exact URL guards against accidental param renames or path
    // version bumps that would silently break the external link.
    expect(sdssNavigateUrl(180.5, 12.3, 2)).toBe(
      'https://skyserver.sdss.org/dr18/VisualTools/navi' +
        `?ra=180.5&dec=12.3&scale=${(2 * 60) / 512}`,
    );
  });

  it('accepts negative declinations (southern hemisphere)', () => {
    const url = sdssNavigateUrl(0, -45.5, 2);
    expect(url).toContain('dec=-45.5');
  });

  it('derives scale from fovArcmin over the fixed 512px Navigate viewport', () => {
    // 4 arcmin over 512 px → 4×60/512 = 0.46875 arcsec/pixel.
    expect(sdssNavigateUrl(0, 0, 4)).toContain('scale=0.46875');
  });
});
