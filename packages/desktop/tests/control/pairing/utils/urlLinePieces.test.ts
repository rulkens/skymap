import { describe, expect, it } from 'vitest';
import { urlLinePieces } from '../../../../src/control/pairing/utils/urlLinePieces';

describe('urlLinePieces', () => {
  it('cuts after the origin and before the code, never inside the scheme or the code', () => {
    expect(urlLinePieces('https://192.168.1.24:47823/remote.html#K7QM3XRT')).toEqual([
      'https://192.168.1.24:47823/',
      'remote.html',
      '#K7QM3XRT',
    ]);
  });

  it('leaves an address without a path or code whole', () => {
    expect(urlLinePieces('https://192.168.1.24:47823')).toEqual(['https://192.168.1.24:47823']);
  });
});
