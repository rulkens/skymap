import { describe, it, expect } from 'vitest';
import { bodyStateInHostFrame } from '../../../src/utils/scene/bodyStateInHostFrame';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { Mat3 } from '../../../src/@types/math/Mat3';

// Large heliocentric magnitude shared by host and body (both orbit the same
// Sun), with a tiny (satellite-scale) Mpc offset between them — the regime
// the cancel-before-scale landmine actually bites in.
const HOST_POSITION_MPC: readonly [number, number, number] = [
  1234.5678901234, -876.54321098, 42.1234567891,
];
const BODY_POSITION_MPC: readonly [number, number, number] = [
  1234.5678911234, -876.54320898, 42.1234567861,
];

describe('bodyStateInHostFrame', () => {
  it('places an attached body in the host fixed axes', () => {
    // 90° rotation about X — a distinct matrix so this case also proves rotM
    // isn't accidentally the identity.
    const bodyOrientation: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
    const host: BodyState = {
      positionMpc: [...HOST_POSITION_MPC],
      orientation: IDENTITY_MAT3 as Mat3,
      meanAnomalyRad: 0,
    };
    const body: BodyState = {
      positionMpc: [...BODY_POSITION_MPC],
      orientation: bodyOrientation,
      meanAnomalyRad: 1,
    };

    const { posM, rotM } = bodyStateInHostFrame(body, host);

    // LANDMINE check: subtract in Mpc first, THEN scale — mirrored here in
    // the same order, so a scale-first regression produces different bits.
    const deltaM: readonly [number, number, number] = [
      (body.positionMpc[0] - host.positionMpc[0]) * SCALE_UNITS.MPC_TO_M,
      (body.positionMpc[1] - host.positionMpc[1]) * SCALE_UNITS.MPC_TO_M,
      (body.positionMpc[2] - host.positionMpc[2]) * SCALE_UNITS.MPC_TO_M,
    ];
    // Identity host orientation: rotateByTranspose is a no-op, so posM is the
    // delta unrotated and rotM is the body's own orientation unchanged.
    expect(posM).toEqual(deltaM);
    expect(rotM).toEqual(bodyOrientation);
  });

  it('rotates the attached body into a non-identity host frame', () => {
    // Host tumbled 90° about Z: column-major [cosθ, sinθ, 0, -sinθ, cosθ, 0, 0, 0, 1]
    // at θ=90° → [0, 1, 0, -1, 0, 0, 0, 0, 1].
    const hostOrientation: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const host: BodyState = {
      positionMpc: [...HOST_POSITION_MPC],
      orientation: hostOrientation,
      meanAnomalyRad: 0,
    };
    const body: BodyState = {
      positionMpc: [...BODY_POSITION_MPC],
      orientation: IDENTITY_MAT3 as Mat3,
      meanAnomalyRad: 1,
    };

    const { posM, rotM } = bodyStateInHostFrame(body, host);

    const deltaM: readonly [number, number, number] = [
      (body.positionMpc[0] - host.positionMpc[0]) * SCALE_UNITS.MPC_TO_M,
      (body.positionMpc[1] - host.positionMpc[1]) * SCALE_UNITS.MPC_TO_M,
      (body.positionMpc[2] - host.positionMpc[2]) * SCALE_UNITS.MPC_TO_M,
    ];
    // Hand-rotate by the INVERSE of the host's 90°-about-Z tumble (rotating a
    // world vector into the host's local axes is the transpose, R(-90)):
    // [x, y, z] → [y, -x, z]. Not calling rotateByTranspose — this is the
    // independent check that the function's own transpose call agrees.
    expect(posM).toEqual([deltaM[1], -deltaM[0], deltaM[2]]);
    // rotM = hostᵀ · body.orientation; body.orientation is identity here, so
    // rotM is exactly hostᵀ — host's rows and columns swapped by hand:
    // host (row-major) = [[0,-1,0],[1,0,0],[0,0,1]] → transpose
    // [[0,1,0],[-1,0,0],[0,0,1]] → column-major [0,-1,0, 1,0,0, 0,0,1].
    expect(rotM).toEqual([0, -1, 0, 1, 0, 0, 0, 0, 1]);
  });
});
