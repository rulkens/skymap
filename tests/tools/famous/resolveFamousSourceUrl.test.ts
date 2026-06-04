/**
 * resolveFamousSourceUrl — turn a recipe's stored attribution URL into a
 * directly-fetchable image URL for the thumb backfill.
 *
 * Recipes store the human attribution URL the maintainer pasted, which for
 * Wikipedia sources is a PAGE url with a `#/media/File:<name>` fragment, not
 * a direct image.  Wikipedia's stable `Special:FilePath/<name>` redirect
 * resolves that fragment to the original upload, so we can re-fetch without
 * scraping.  Already-direct image URLs pass through; anything we can't resolve
 * returns null so the caller skips + logs it rather than fetching an HTML page.
 */
import { describe, expect, it } from 'vitest';
import { resolveFamousSourceUrl } from '../../../tools/famous/resolveFamousSourceUrl';

describe('resolveFamousSourceUrl', () => {
  it('maps a Wikipedia #/media/File: fragment to Special:FilePath', () => {
    expect(
      resolveFamousSourceUrl('https://en.wikipedia.org/wiki/NGC_3031#/media/File:M81.jpg'),
    ).toBe('https://en.wikipedia.org/wiki/Special:FilePath/M81.jpg');
  });

  it('URL-encodes the file name (spaces → %20; parens kept literal, as Wikipedia accepts)', () => {
    expect(
      resolveFamousSourceUrl(
        'https://en.wikipedia.org/wiki/NGC_4594#/media/File:Sombrero Galaxy (NIRCam).png',
      ),
    ).toBe('https://en.wikipedia.org/wiki/Special:FilePath/Sombrero%20Galaxy%20(NIRCam).png');
  });

  it('passes a direct upload.wikimedia.org image URL through unchanged', () => {
    const direct = 'https://upload.wikimedia.org/wikipedia/commons/0/05/M81.jpg';
    expect(resolveFamousSourceUrl(direct)).toBe(direct);
  });

  it('passes a bare image URL (ends in an image extension) through unchanged', () => {
    const direct = 'https://example.com/images/ngc1300.png';
    expect(resolveFamousSourceUrl(direct)).toBe(direct);
  });

  it('returns null for an unresolvable page URL (no File: fragment, not an image)', () => {
    expect(resolveFamousSourceUrl('https://www.noirlab.edu/public/images/noao-m51/')).toBeNull();
  });
});
