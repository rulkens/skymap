/**
 * Unit tests for `sdssThumbnailUrl` — pure URL builder for SDSS image cutouts.
 *
 * Validates URL shape, default size, Dec sign handling, and the [32, 2048]
 * pixel-size clamp.
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

  it('accepts negative declinations (southern hemisphere)', () => {
    // The service understands signed Dec; we just interpolate the literal
    // number into the URL — no sign munging required.
    const url = sdssThumbnailUrl(0, -45.5);
    expect(url).toContain('dec=-45.5');
  });

  it('accepts dec = 0 exactly (equatorial)', () => {
    // The boundary between northern and southern hemispheres — should
    // serialise as the literal "0".
    expect(sdssThumbnailUrl(0, 0)).toContain('dec=0');
  });

  it('clamps sizePx upward at 2048 (DR18 service ceiling)', () => {
    // The service rejects requests larger than 2048 px.  Clamping in the
    // builder rather than at the caller keeps the contract local.
    const url = sdssThumbnailUrl(0, 0, 100000);
    expect(url).toContain('width=2048');
    expect(url).toContain('height=2048');
  });

  it('clamps sizePx downward at 32 (DR18 service floor)', () => {
    // The service rejects very small cutouts — clamp at 32 px to keep the
    // request valid even for callers passing 0 or negative.
    const url = sdssThumbnailUrl(0, 0, 1);
    expect(url).toContain('width=32');
    expect(url).toContain('height=32');
  });

  it('passes through valid sizes within [32, 2048] unchanged', () => {
    // Mid-range sizes (e.g. 200 px used in InfoCard) flow through verbatim.
    const url = sdssThumbnailUrl(0, 0, 200);
    expect(url).toContain('width=200');
    expect(url).toContain('height=200');
  });

  it('derives scale from fovArcmin so the cutout frames the galaxy', () => {
    // 4 arcmin over 200 px → 4×60/200 = 1.2 arcsec/pixel.  Without the FOV
    // arg the scale stays at the native 0.4 (asserted in the first test).
    expect(sdssThumbnailUrl(0, 0, 200, 4)).toContain('scale=1.2');
  });
});
