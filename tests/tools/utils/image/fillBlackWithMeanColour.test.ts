import { describe, expect, it } from 'vitest';
import { fillBlackWithMeanColour } from '../../../../tools/utils/image/fillBlackWithMeanColour';

describe('fillBlackWithMeanColour', () => {
  it('paints exact-black pixels with the mean of the rest and returns that mean', () => {
    // Pixel 1 is black, pixel 2 has a zero channel but is not black, so it counts.
    const rgb = new Uint8Array([100, 50, 0, 0, 0, 0, 200, 150, 40, 0, 0, 0]);
    expect(fillBlackWithMeanColour(rgb)).toEqual([150, 100, 20]);
    expect([...rgb]).toEqual([100, 50, 0, 150, 100, 20, 200, 150, 40, 150, 100, 20]);
  });

  it('leaves an all-black buffer alone', () => {
    const rgb = new Uint8Array(6);
    fillBlackWithMeanColour(rgb);
    expect([...rgb]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
