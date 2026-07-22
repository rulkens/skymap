import { describe, it, expect } from 'vitest';
import {
  buildConstellationInstances,
  FLOATS_PER_SEGMENT,
} from '../../../../../src/services/gpu/renderers/constellations/buildConstellationInstances';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import type { ConstellationsArtifact } from '../../../../../src/@types/loading/ConstellationsArtifact';

/**
 * The instance builder is the TS half of the byte-layout parity with
 * `shaders/constellations/io.wesl` — the vertex stage reads aWorld@offset0,
 * aAppMag@12, bWorld@16, bAppMag@28 (8 f32 / 32-byte stride). A drift between
 * the two is invisible until the GPU reads garbage (or iOS drops the frame), so
 * this pins the f32 slot each field lands in, plus the parsec→Mpc scale the
 * builder applies (the shader receives world Mpc). This is the WESL/TS parity
 * keep-rule, not a constant restatement.
 */
describe('buildConstellationInstances', () => {
  const artifact: ConstellationsArtifact = {
    version: 1,
    constellations: [
      {
        name: 'Alpha',
        labelAnchorPc: [0, 0, 0],
        segments: [
          { aPc: [1, 2, 3], aAppMag: 0.5, bPc: [4, 5, 6], bAppMag: 1.5 },
          { aPc: [7, 8, 9], aAppMag: 2.5, bPc: [10, 11, 12], bAppMag: 3.5 },
        ],
      },
      {
        name: 'Beta',
        labelAnchorPc: [0, 0, 0],
        segments: [{ aPc: [-1, -2, -3], aAppMag: 4.5, bPc: [-4, -5, -6], bAppMag: 5.5 }],
      },
    ],
  };

  it('emits one 8-float instance per segment across all figures', () => {
    const { data, segmentCount } = buildConstellationInstances(artifact);
    expect(segmentCount).toBe(3);
    expect(FLOATS_PER_SEGMENT).toBe(8);
    expect(data.length).toBe(3 * 8);
  });

  it('packs each endpoint at the pinned f32 slots, scaling parsecs to Mpc', () => {
    const { data } = buildConstellationInstances(artifact);
    const s = SCALE_UNITS.PC_TO_MPC;
    // f32-exact comparison — the buffer is a Float32Array, so the stored value is
    // Math.fround of the double product.
    // First segment of the first figure.
    expect(data[0]).toBe(Math.fround(1 * s)); // aWorld.x (slot 0)
    expect(data[1]).toBe(Math.fround(2 * s)); // aWorld.y (slot 1)
    expect(data[2]).toBe(Math.fround(3 * s)); // aWorld.z (slot 2)
    expect(data[3]).toBe(0.5); //              aAppMag  (slot 3, unscaled)
    expect(data[4]).toBe(Math.fround(4 * s)); // bWorld.x (slot 4)
    expect(data[5]).toBe(Math.fround(5 * s)); // bWorld.y (slot 5)
    expect(data[6]).toBe(Math.fround(6 * s)); // bWorld.z (slot 6)
    expect(data[7]).toBe(1.5); //              bAppMag  (slot 7, unscaled)
    // Second figure's only segment starts at instance index 2 (float offset 16).
    expect(data[16]).toBe(Math.fround(-1 * s));
    expect(data[19]).toBe(4.5);
    expect(data[23]).toBe(5.5);
  });

  it('yields an empty buffer for an artifact with no segments', () => {
    const { data, segmentCount } = buildConstellationInstances({ version: 1, constellations: [] });
    expect(segmentCount).toBe(0);
    expect(data.length).toBe(0);
  });
});
