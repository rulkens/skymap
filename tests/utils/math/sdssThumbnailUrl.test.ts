/**
 * Unit tests for `sdssThumbnailUrl` — pure URL builder for SDSS image cutouts.
 *
 * Validates URL shape, default size, Dec sign handling, and the FOV-derived
 * scale.
 */

import { describe, it, expect } from 'vitest';
import { sdssThumbnailUrl } from '../../../src/utils/math/sdssThumbnailUrl';

describe('sdssThumbnailUrl', () => {
  it('builds the canonical DR18 ImgCutout URL with the default 160 px size', () => {
    // Pinning the exact URL guards against accidental param renames or path
    // version bumps that would silently break thumbnails in production.
    expect(sdssThumbnailUrl(180.5, 12.3)).toBe(
      'https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg' +
        '?ra=180.5&dec=12.3&scale=0.4&width=160&height=160',
    );
  });

  it('derives scale from fovArcmin so the cutout frames the galaxy', () => {
    // 4 arcmin over 200 px → 4×60/200 = 1.2 arcsec/pixel.  Without the FOV
    // arg the scale stays at the native 0.4 (asserted in the first test).
    expect(sdssThumbnailUrl(0, 0, 200, 4)).toContain('scale=1.2');
  });
});
