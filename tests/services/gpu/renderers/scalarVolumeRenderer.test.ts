import { describe, it, expect } from 'vitest';
import { buildCubeModelMatrix } from '../../../../src/services/gpu/renderers/scalarVolumeRenderer';
import type { ScalarCube } from '../../../../src/@types/ScalarCube';

function fixture(overrides: Partial<ScalarCube> = {}): ScalarCube {
  return {
    dims: [4, 4, 4],
    voxels: new Uint16Array(64),
    frameKind: 'equatorial-cartesian',
    origin: [-100, -100, -100],
    voxelSize: 50,
    rotation: [0, 0, 0, 1],
    paletteId: 'blue-purple',
    densityScale: 1.0,
    valueMin: 0,
    valueMax: 1,
    ...overrides,
  };
}

describe('buildCubeModelMatrix', () => {
  it('maps unit-cube corner (0,0,0) to the cube origin in world space', () => {
    const m = buildCubeModelMatrix(fixture());
    // m * [0,0,0,1] should equal [origin, 1].  Column-major mat4 ⇒
    // translation lives in elements 12..14.
    expect(m[12]).toBeCloseTo(-100);
    expect(m[13]).toBeCloseTo(-100);
    expect(m[14]).toBeCloseTo(-100);
  });

  it('maps unit-cube corner (1,1,1) to origin + dims*voxelSize', () => {
    const m = buildCubeModelMatrix(fixture());
    // Apply m to [1,1,1,1]: the result is origin + dims*voxelSize on
    // each axis.  For an identity rotation and equatorial frame, that's
    // a clean (-100 + 4*50, -100 + 4*50, -100 + 4*50) = (100, 100, 100).
    const x = m[0]! + m[4]! + m[8]! + m[12]!;
    const y = m[1]! + m[5]! + m[9]! + m[13]!;
    const z = m[2]! + m[6]! + m[10]! + m[14]!;
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(100);
    expect(z).toBeCloseTo(100);
  });

  it('applies the supergalactic→equatorial rotation when frameKind is supergalactic', () => {
    const m = buildCubeModelMatrix(fixture({ frameKind: 'supergalactic-cartesian' }));
    // The rotation is non-identity, so the upper-left 3x3 should not
    // be a pure scale matrix.  Specifically, off-diagonal entries should
    // be non-zero (the rotation mixes axes).
    const offDiag = Math.abs(m[1]!) + Math.abs(m[2]!) + Math.abs(m[4]!) + Math.abs(m[6]!);
    expect(offDiag).toBeGreaterThan(0.01);
  });

  it('keeps an observer-centered cube centred under non-identity rotation', () => {
    // 90° rotation around the Z axis as a unit quaternion (x, y, z, w).
    // The cube fixture is observer-centred (origin = -dims*voxelSize/2),
    // so its geometric centre sits at the native frame's origin.  Under
    // ANY rotation about that origin, the centre must remain at (0,0,0)
    // in native space — and after FRAME_TO_WORLD identity (equatorial
    // frame here) at (0,0,0) in world space too.
    //
    // The previous matrix order (translate-then-rotate) failed this:
    // it pivoted the cube around its corner rather than its centre,
    // so the centre ended up at `R*(-origin) + origin ≠ origin` for any
    // non-identity R.  The current order (rotate-then-translate, with
    // gl-matrix's post-multiply semantics: copy → R → T → S) fixes it.
    const s = Math.SQRT1_2;
    const m = buildCubeModelMatrix(fixture({ rotation: [0, 0, s, s] }));
    // Apply m to the unit-cube centre (0.5, 0.5, 0.5, 1).  Column-major
    // mat4 means m[col*4 + row]; the (cx, cy, cz) below is the standard
    // dot of each row with the homogeneous coordinate.
    const cx = m[0]! * 0.5 + m[4]! * 0.5 + m[8]! * 0.5 + m[12]!;
    const cy = m[1]! * 0.5 + m[5]! * 0.5 + m[9]! * 0.5 + m[13]!;
    const cz = m[2]! * 0.5 + m[6]! * 0.5 + m[10]! * 0.5 + m[14]!;
    expect(cx).toBeCloseTo(0, 5);
    expect(cy).toBeCloseTo(0, 5);
    expect(cz).toBeCloseTo(0, 5);
  });
});
