/**
 * sampleIsmMapOrientation is a nearest-texel (not bilinear) reader — the
 * header's own reason is that interpolating angle directly would average
 * opposite orientations into a false perpendicular at the pi wrap. Two
 * properties of that quantization had no test: that a mid-bin angle really
 * does read one whole texel (not a blend), and the az=0/az=az-1 seam, where
 * the wrap formula's `+ 2*PI` step rounds an input distinctly BELOW 2*PI
 * back up to exactly 2*PI in double precision, landing the read on texel 0
 * rather than the last bin a naive "angle < 2*PI" mental model expects.
 */
import { describe, expect, it } from 'vitest';
import { sampleIsmMapOrientation } from '../../../src/utils/galaxy/sampleIsmMapOrientation';
import type { GalaxyIsmMapOrientation } from '../../../src/@types/galaxy/GalaxyIsmMapOrientation';

const AZ = 4;
const RINGS = 1;
const R_MIN = 0;
const R_MAX = 10;
// One marker coherence per az bin (angle 0 throughout), so reading a bin
// back is a single equality check rather than an angle round-trip.
const BIN_COHERENCE = [0.1, 0.2, 0.3, 0.4];

function makeOrientation(): GalaxyIsmMapOrientation {
  const data = new Float32Array(RINGS * AZ * 2);
  for (let k = 0; k < AZ; k++) {
    data[k * 2] = BIN_COHERENCE[k]!;
    data[k * 2 + 1] = 0;
  }
  return { az: AZ, rings: RINGS, rMin: R_MIN, rMax: R_MAX, data };
}

describe('sampleIsmMapOrientation', () => {
  it('reads one whole texel at a mid-bin angle, not a blend of neighbours', () => {
    const map = makeOrientation();
    // Bin 2 of 4 spans [pi, 1.5*pi); its midpoint is 1.25*pi.
    const sample = sampleIsmMapOrientation(map, 1, 1.25 * Math.PI);
    expect(sample.coherence).toBeCloseTo(BIN_COHERENCE[2]!, 6);
  });

  it('samples texel az=0 for a world angle just below 2*PI (seam wraparound)', () => {
    const map = makeOrientation();
    const angle = 2 * Math.PI - 1e-15;
    expect(angle).not.toBe(2 * Math.PI); // a distinct float, not literally the wrap point
    const sample = sampleIsmMapOrientation(map, 1, angle);
    // The naive expectation is the LAST bin (angle is a hair under 2*PI); the
    // wrap formula's re-addition of 2*PI rounds back up to exactly 2*PI in
    // double precision, so the read actually lands on bin 0.
    expect(sample.coherence).toBeCloseTo(BIN_COHERENCE[0]!, 6);
  });
});
