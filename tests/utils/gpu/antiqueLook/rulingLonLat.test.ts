/**
 * rulingLonLat over the real frame data — a sky frame's axes are re-ordered out
 * of `ORIENTATION_FRAMES` (pole in the middle column, 90° axis negated), so a
 * slip there numbers longitude backwards or from the wrong origin; a globe's
 * longitude counts from its prime meridian, read on its surface, not the sky.
 */

import { describe, it, expect } from 'vitest';

import { rulingLonLat } from '../../../../src/utils/gpu/antiqueLook/rulingLonLat';
import {
  ANTIQUE_GLOBE_RULINGS,
  ANTIQUE_SKY_RULING_AXES,
} from '../../../../src/data/rendering/antiqueRulings';
import { GAL_X_EQ, GAL_Y_EQ } from '../../../../src/data/orientation/orientationFrames';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const RAD = Math.PI / 180;
const fromRaDec = (raDeg: number, decDeg: number): Vec3 => [
  Math.cos(decDeg * RAD) * Math.cos(raDeg * RAD),
  Math.cos(decDeg * RAD) * Math.sin(raDeg * RAD),
  Math.sin(decDeg * RAD),
];
const sky = (id: keyof typeof ANTIQUE_SKY_RULING_AXES) => ({
  axes: ANTIQUE_SKY_RULING_AXES[id],
  lonOffsetDeg: 0,
  globeCentre: null,
});

describe('rulingLonLat', () => {
  it('reads ecliptic longitude eastward from the equinox', () => {
    // The June solstice: RA 90°, Dec +23.44° is ecliptic (90°, 0°).
    const [lon, lat] = rulingLonLat(sky('ecliptic'), fromRaDec(90, 23.4393))!;
    expect(lon).toBeCloseTo(90, 2);
    expect(lat).toBeCloseTo(0, 2);
  });

  it('reads galactic longitude from the Galactic Centre toward the rotation', () => {
    expect(rulingLonLat(sky('galactic'), GAL_X_EQ)![0]).toBeCloseTo(0, 3);
    expect(rulingLonLat(sky('galactic'), GAL_Y_EQ)![0]).toBeCloseTo(90, 3);
  });

  it('numbers Earth from the Pico de Teide, read where the ray meets the ground', () => {
    // Two radii straight over Amsterdam (4.90° E, 52.37° N), looking at the centre.
    const earth = ANTIQUE_GLOBE_RULINGS.find((g) => g.body.id === 'earth')!;
    const up = fromRaDec(4.9, 52.37);
    const frame = {
      axes: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
      lonOffsetDeg: earth.lonOffsetDeg,
      globeCentre: up.map((v) => -2 * v) as Vec3,
    };
    const [lon, lat] = rulingLonLat(frame, up.map((v) => -v) as Vec3)!;
    expect(lon).toBeCloseTo(4.9 + 16.6423, 6);
    expect(lat).toBeCloseTo(52.37, 6);
    expect(rulingLonLat(frame, up)).toBeNull();
  });
});
