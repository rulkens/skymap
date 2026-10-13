import { describe, expect, it } from 'vitest';

import { portraitCrop } from '../../../tools/site/utils/portraitCrop';

const frame = { width: 3840, height: 2160 };
const out = { width: 720, height: 1280 };

describe('portraitCrop', () => {
  it('cuts a centred 9:16 region with no padding by default', () => {
    expect(portraitCrop(frame, out)).toEqual({
      left: 1313,
      width: 1215,
      height: 2160,
      scaledHeight: 1280,
      padTop: 0,
      padBottom: 0,
    });
  });

  it('keeps an off-centre crop inside the frame', () => {
    expect(portraitCrop(frame, out, 0).left).toBe(0);
    const right = portraitCrop(frame, out, 1);
    expect(right.left + right.width).toBe(frame.width);
  });

  it('a zoom below 1 widens the region and pads to the full output height', () => {
    const crop = portraitCrop(frame, out, 0.5, 0.4);
    expect(crop.width).toBe(3038);
    expect(crop.padTop + crop.scaledHeight + crop.padBottom).toBe(out.height);
    expect(crop.scaledHeight).toBeLessThan(out.height);
    expect(portraitCrop(frame, out, 0.5, 0.1).width).toBe(frame.width);
  });
});
