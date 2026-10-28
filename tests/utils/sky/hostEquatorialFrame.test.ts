/**
 * hostEquatorialFrame — the frame a sky-mode equatorial grid is drawn in: the
 * host's pole as normal, RA zero at its vernal equinox (its equator's node on
 * its orbit plane). On Earth at J2000 that must be the scene's own frame.
 */
import { describe, it, expect } from 'vitest';

import { hostEquatorialFrame } from '../../../src/utils/sky/hostEquatorialFrame';
import { ECLIPTIC_FRAME, MARS_EQUATORIAL_FRAME } from '../../../src/data/bodies/orbitPlaneFrames';
import { dot3 } from '../../../src/utils/math/dot3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const near = (a: Readonly<Vec3>, b: Readonly<Vec3>) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 12));

describe('hostEquatorialFrame', () => {
  it("puts RA zero on the J2000 equinox for Earth's J2000 pole and the ecliptic", () => {
    const frame = hostEquatorialFrame([0, 0, 1], ECLIPTIC_FRAME.normal);
    near(frame.xAxis, [1, 0, 0]);
    near(frame.yAxis, [0, 1, 0]);
    near(frame.normal, [0, 0, 1]);
  });

  it('is a right-handed orthonormal frame whose equinox lies in both planes', () => {
    // Mars's pole against the ecliptic stands in for any tilted host.
    const pole = MARS_EQUATORIAL_FRAME.normal;
    const frame = hostEquatorialFrame(pole, ECLIPTIC_FRAME.normal);
    expect(dot3(frame.xAxis, pole)).toBeCloseTo(0, 12);
    expect(dot3(frame.xAxis, ECLIPTIC_FRAME.normal)).toBeCloseTo(0, 12);
    expect(dot3(frame.xAxis, frame.xAxis)).toBeCloseTo(1, 12);
    expect(dot3(frame.yAxis, frame.xAxis)).toBeCloseTo(0, 12);
    near(frame.normal, pole);
    // x × y = normal.
    const [x, y] = [frame.xAxis, frame.yAxis];
    near([x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]], pole);
  });

  it('points RA zero where the orbit plane ascends through the equator', () => {
    // Earth: the Sun crosses the equator northward at the March equinox, heading
    // along +y of the ecliptic from +x — so the ecliptic's +y has positive z.
    const frame = hostEquatorialFrame([0, 0, 1], ECLIPTIC_FRAME.normal);
    expect(dot3(ECLIPTIC_FRAME.yAxis, frame.normal)).toBeGreaterThan(0);
    expect(dot3(frame.xAxis, ECLIPTIC_FRAME.xAxis)).toBeCloseTo(1, 12);
  });
});
