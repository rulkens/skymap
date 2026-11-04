import { describe, expect, it } from 'vitest';

import { shotOfSrc } from '../../../tools/site/utils/shotOfSrc';

describe('shotOfSrc', () => {
  it('reads the id and width from a full URL and from a path', () => {
    expect(shotOfSrc('http://localhost:5800/home/shots/place-sgr-a-240.3f9c01ab.avif')).toEqual({
      id: 'place-sgr-a',
      width: 240,
    });
    expect(shotOfSrc('/home/shots/tour-cosmic-web-1920.0d4e7b2c.webp')).toEqual({
      id: 'tour-cosmic-web',
      width: 1920,
    });
  });

  it('decodes an escaped path and refuses files not named like a shot', () => {
    expect(shotOfSrc('/My%20Site/shots/ui-search-800.5a1b2c3d.webp')?.id).toBe('ui-search');
    expect(
      shotOfSrc('/home/_image/?href=%2Fassets%2Fflight%2Fearth-portrait.avif&w=480'),
    ).toBeNull();
    expect(shotOfSrc('/assets/flight/earth-landscape.avif')).toBeNull();
    expect(shotOfSrc('')).toBeNull();
  });
});
