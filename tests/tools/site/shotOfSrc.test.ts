import { describe, expect, it } from 'vitest';

import { shotOfSrc } from '../../../tools/site/utils/shotOfSrc';

describe('shotOfSrc', () => {
  it('reads the id and width from a dev-server file and from a hashed build file', () => {
    expect(
      shotOfSrc('http://localhost:5800/@fs/r/src/assets/shots/place-sgr-a-240.avif?no-inline'),
    ).toEqual({ id: 'place-sgr-a', width: 240 });
    expect(shotOfSrc('/home/_astro/tour-cosmic-web-1920.Bx3k_9aQ.webp')).toEqual({
      id: 'tour-cosmic-web',
      width: 1920,
    });
  });

  it('decodes an escaped path and refuses files not named like a shot', () => {
    expect(shotOfSrc('/@fs/My%20Repo/assets/shots/ui-search-800.webp')?.id).toBe('ui-search');
    expect(
      shotOfSrc('/home/_image/?href=%2Fassets%2Fflight%2Fearth-portrait.avif&w=480'),
    ).toBeNull();
    expect(shotOfSrc('/assets/flight/earth-landscape.avif')).toBeNull();
    expect(shotOfSrc('')).toBeNull();
  });
});
