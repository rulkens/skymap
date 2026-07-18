import { describe, it, expect } from 'vitest';
import { rotationFromIau } from '../../../src/utils/orbit/rotationFromIau';
import type { RotationElements } from '../../../src/@types/scene/RotationElements';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Apply a column-major Mat3 to a column vector: result[r] = Σ_c m[c*3 + r]·v[c].
// A local restatement (not the source's helper) so the test observes the matrix
// through the public column-major contract, independent of how it was built.
const apply = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];

// A body whose IAU north pole already sits at the equatorial north pole
// (α = 0, δ = 90°). The Rx(90° − δ) tilt factor vanishes, so the composition
// reduces to a pure spin about +z — which is exactly what isolates the pole
// placement (test 1) and the prime-meridian spin W₀ (test 2).
const poleAtZenith: RotationElements = {
  id: 'test',
  poleRaDeg: 0,
  poleDecDeg: 90,
  primeMeridianDeg: 0,
};

describe('rotationFromIau', () => {
  it('puts the pole on +z for (α=0, δ=90)', () => {
    const r = rotationFromIau(poleAtZenith);

    // The body pole is local +z; a pole already at the equatorial north pole
    // must map to world +z with no tilt.
    const worldPole = apply(r, [0, 0, 1]);
    expect(worldPole[0]).toBeCloseTo(0, 12);
    expect(worldPole[1]).toBeCloseTo(0, 12);
    expect(worldPole[2]).toBeCloseTo(1, 12);
  });

  it('rotates the prime meridian by W0', () => {
    // With W₀ = 0 the 90° + α pole-azimuth offset already carries the local
    // prime meridian (local +x) to world +y.
    const atZero = rotationFromIau(poleAtZenith);
    const meridianAtZero = apply(atZero, [1, 0, 0]);
    expect(meridianAtZero[0]).toBeCloseTo(0, 12);
    expect(meridianAtZero[1]).toBeCloseTo(1, 12);
    expect(meridianAtZero[2]).toBeCloseTo(0, 12);

    // A 90° W₀ spins the prime meridian a further 90° about the +z pole:
    // world +y → world −x.
    const spun = rotationFromIau({ ...poleAtZenith, primeMeridianDeg: 90 });
    const meridianSpun = apply(spun, [1, 0, 0]);
    expect(meridianSpun[0]).toBeCloseTo(-1, 12);
    expect(meridianSpun[1]).toBeCloseTo(0, 12);
    expect(meridianSpun[2]).toBeCloseTo(0, 12);
  });
});
