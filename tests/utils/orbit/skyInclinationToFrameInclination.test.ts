import { describe, it, expect } from 'vitest';
import { skyInclinationToFrameInclination } from '../../../src/utils/orbit/skyInclinationToFrameInclination';
import { skyPositionAngleToFrameAngle } from '../../../src/utils/orbit/skyPositionAngleToFrameAngle';
import { keplerianEllipse } from '../../../src/utils/orbit/keplerianEllipse';
import { planeFrameFromPole } from '../../../src/data/bodies/orbitPlaneFrames';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The plane of the sky at Sgr A*, built from the same pole the feature's frame
// uses. Constructed here rather than imported so this gate does not wait on the
// frame constant landing.
const GC_SKY_FRAME = planeFrameFromPole(266.41684, -29.00781);

const RAD_TO_DEG = 180 / Math.PI;

describe('skyInclinationToFrameInclination', () => {
  it("maps S2's published inclination to the prograde-about-the-outward-normal branch", () => {
    const iFrame = skyInclinationToFrameInclination(134.18);

    expect(iFrame * RAD_TO_DEG).toBeCloseTo(45.82, 10);
    // Clockwise on the sky ⇒ angular momentum away from the observer ⇒ below
    // 90° about a normal that points away. A pass-through lands at 134°.
    expect(iFrame).toBeLessThan(Math.PI / 2);
  });

  it('gives a face-on prograde orbit that starts due North and moves East', () => {
    // The astrometric convention for (i, Ω, ω) = (0, 0, 0): periapsis due
    // North, prograde motion toward East. That expectation comes from the
    // convention, not from this code — which is what makes it a gate.
    const elements: OrbitalElements = {
      id: 'face-on-prograde',
      focusId: 'sgr-a-star',
      semiMajorMpc: 1,
      eccentricity: 0,
      inclinationRad: skyInclinationToFrameInclination(0),
      ascendingNodeRad: skyPositionAngleToFrameAngle(0),
      argPeriapsisRad: 0,
      meanAnomalyRad: 0,
      color: [1, 1, 1],
      plane: GC_SKY_FRAME,
    };

    const { semiMajorMpc, semiMinorMpc } = keplerianEllipse(elements);

    // keplerianEllipse returns WORLD vectors, so project onto the frame basis
    // rather than reading raw components. P̂ = North is unchanged by dropping
    // the inclination flip; Q̂ = East becomes West, so the semi-minor sign is
    // the single bit that separates the true orbit from its mirror.
    expect(dot(semiMajorMpc, GC_SKY_FRAME.yAxis)).toBeCloseTo(1, 12);
    expect(dot(semiMinorMpc, GC_SKY_FRAME.xAxis)).toBeCloseTo(1, 12);
  });
});
