import { describe, expect, it } from 'vitest';

import type { StarField } from '../../../packages/website/src/@types/StarField';
import { decodeStarField } from '../../../packages/website/src/utils/decodeStarField';
import { encodeStarField } from '../../../tools/site/utils/encodeStarField';
import { starBandPosition } from '../../../tools/site/utils/starBandPosition';
import { starDistanceLayer } from '../../../tools/site/utils/starDistanceLayer';

describe('starBandPosition', () => {
  it('runs south down the page from the centre meridian, over the pole and round', () => {
    expect(starBandPosition(84, 0, 84).along).toBeCloseTo(0);
    expect(starBandPosition(84, -30, 84).along).toBeCloseTo(30);
    expect(starBandPosition(264, 0, 84).along).toBeCloseTo(180);
    expect(starBandPosition(10, 90, 84).along).toBeCloseTo(270);
    expect(starBandPosition(84, 60, 84).along).toBeCloseTo(300);
  });

  it('puts east positive across, stretched as Mercator', () => {
    // ln(tan(45° + 15°)) in degrees.
    expect(starBandPosition(114, 0, 84).across).toBeCloseTo(31.47, 2);
    expect(starBandPosition(54, 0, 84).across).toBeCloseTo(-31.47, 2);
    expect(starBandPosition(84, -45, 84).across).toBeCloseTo(0);
  });
});

describe('starDistanceLayer', () => {
  it('doubles each layer outward from the nearest edge, the last taking the rest', () => {
    expect([4, 24.9, 25, 49.9, 50, 100, 399, 400, 5000].map((d) => starDistanceLayer(d, 25, 6))).toEqual([
      0, 0, 1, 1, 2, 3, 4, 5, 5,
    ]);
  });
});

describe('starField.bin', () => {
  it('reads back what the bake wrote, within the format steps', () => {
    const field: StarField = {
      layers: [
        { distancePc: 17.4, end: 2 },
        { distancePc: 606, end: 3 },
      ],
      palette: ['#cfdcff', '#ffb18a'],
      along: Float32Array.from([0.3, 359.999, 180.25]),
      across: Float32Array.from([-57.9, 0, 31.47]),
      mag: Float32Array.from([-1.09, 6, 3.35]),
      tint: Uint8Array.from([0, 1, 1]),
    };
    const back = decodeStarField(encodeStarField(field).buffer as ArrayBuffer);
    expect(back.layers).toEqual([
      { distancePc: 17, end: 2 },
      { distancePc: 606, end: 3 },
    ]);
    expect(back.palette).toEqual(field.palette);
    expect(back.tint).toEqual(field.tint);
    expect(back.along[0]).toBeCloseTo(0.3, 2);
    expect(back.along[1]).toBeCloseTo(0, 2);
    expect(back.along[2]).toBeCloseTo(180.25, 2);
    expect([...back.across]).toEqual([-57.9, 0, 31.47].map((v) => expect.closeTo(v, 2)));
    expect([...back.mag]).toEqual([-1.1, 6, 3.35].map((v) => expect.closeTo(v, 1)));
  });
});
