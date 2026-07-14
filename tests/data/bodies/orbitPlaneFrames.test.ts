import { describe, it, expect } from 'vitest';
import {
  ECLIPTIC_FRAME,
  MARS_EQUATORIAL_FRAME,
  JUPITER_EQUATORIAL_FRAME,
  SATURN_EQUATORIAL_FRAME,
} from '../../../src/data/bodies/orbitPlaneFrames';
import type { OrbitPlaneFrame } from '../../../src/@types/scene/OrbitPlaneFrame';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Readonly<Vec3>) => Math.sqrt(dot(a, a));
const cross = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const FRAMES: ReadonlyArray<readonly [string, OrbitPlaneFrame]> = [
  ['ECLIPTIC_FRAME', ECLIPTIC_FRAME],
  ['MARS_EQUATORIAL_FRAME', MARS_EQUATORIAL_FRAME],
  ['JUPITER_EQUATORIAL_FRAME', JUPITER_EQUATORIAL_FRAME],
  ['SATURN_EQUATORIAL_FRAME', SATURN_EQUATORIAL_FRAME],
];

describe('orbit plane frames', () => {
  // A plane frame must be an orthonormal right-handed basis, or the perifocal →
  // world mapping in keplerianEllipse silently skews / scales the orbit. Each
  // frame is derived independently (the ecliptic from the obliquity, the rest
  // from IAU pole directions), so these are genuine per-frame invariants.
  for (const [name, frame] of FRAMES) {
    it(`${name} is an orthonormal right-handed basis`, () => {
      expect(len(frame.xAxis)).toBeCloseTo(1, 12);
      expect(len(frame.yAxis)).toBeCloseTo(1, 12);
      expect(len(frame.normal)).toBeCloseTo(1, 12);

      expect(dot(frame.xAxis, frame.yAxis)).toBeCloseTo(0, 12);
      expect(dot(frame.xAxis, frame.normal)).toBeCloseTo(0, 12);
      expect(dot(frame.yAxis, frame.normal)).toBeCloseTo(0, 12);

      const xy = cross(frame.xAxis, frame.yAxis);
      expect(xy[0]).toBeCloseTo(frame.normal[0], 12);
      expect(xy[1]).toBeCloseTo(frame.normal[1], 12);
      expect(xy[2]).toBeCloseTo(frame.normal[2], 12);
    });
  }

  it('tilts the ecliptic normal from frame +z by the obliquity', () => {
    // Both are unit vectors, so the dot product is cos(angle) directly. The
    // expected obliquity is written as the literal 23.44° in radians rather than
    // through degToRad, so a broken conversion would not hide behind a mirror.
    const cosAngle = dot(ECLIPTIC_FRAME.normal, [0, 0, 1]);
    expect(Math.acos(cosAngle)).toBeCloseTo((23.44 * Math.PI) / 180, 12);
  });
});
