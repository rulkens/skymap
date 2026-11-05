import { describe, expect, it } from 'vitest';

import { pictureFit } from '../../../tools/site/utils/pictureFit';

describe('pictureFit', () => {
  it('scales a 16:9 picture in a square cover box to the box height, cutting away 44%', () => {
    const fit = pictureFit(252, 252, 1600, 900, 'cover', 2);
    expect(fit.drawnWidth).toBeCloseTo(448);
    expect(fit.neededWidth).toBeCloseTo(896);
    expect(fit.croppedShare).toBeCloseTo(1 - 9 / 16);
  });

  it('needs the box width when the aspects agree, whatever the fit', () => {
    for (const objectFit of ['cover', 'contain', 'fill']) {
      const fit = pictureFit(800, 450, 1600, 900, objectFit, 2);
      expect([fit.neededWidth, fit.croppedShare, fit.stretch]).toEqual([1600, 0, 1]);
    }
  });

  it('reads only the aspect, so a srcset image with a density-corrected size gives the same answer', () => {
    expect(pictureFit(400, 400, 800, 450, 'cover', 3)).toEqual(
      pictureFit(400, 400, 1920, 1080, 'cover', 3),
    );
  });

  it('measures how far fill distorts and contain draws narrower than a wide box', () => {
    expect(pictureFit(400, 400, 1600, 900, 'fill', 1).stretch).toBeCloseTo(9 / 16);
    expect(pictureFit(1000, 300, 400, 400, 'contain', 2).neededWidth).toBe(600);
  });
});
