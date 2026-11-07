import { describe, expect, it } from 'vitest';

import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { placeLabel } from '../../../src/utils/places/placeLabel';

const DEG = Math.PI / 180;
const spotAt = (body: string, lonDeg: number, latDeg: number): SkySpot => ({
  body: asSceneBodyId(body),
  lonRad: lonDeg * DEG,
  latRad: latDeg * DEG,
});

describe('placeLabel', () => {
  it('names a spot inside 25 km of Søndermarken', () => {
    expect(placeLabel(spotAt('earth', 12.52, 55.67))).toEqual({ text: 'Søndermarken', near: true });
  });
  it('gives coordinates 40 km out', () => {
    // 40 km north of Søndermarken is ~0.36° of latitude, clear of Copenhagen too.
    expect(placeLabel(spotAt('earth', 12.5233, 56.03))).toEqual({
      text: '56.03° N 12.52° E',
      near: false,
    });
  });
  it('gives coordinates on Mars, with hemisphere letters', () => {
    expect(placeLabel(spotAt('mars', -12.52, -55.67))).toEqual({
      text: '55.67° S 12.52° W',
      near: false,
    });
  });
});
