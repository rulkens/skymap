import { describe, it, expect } from 'vitest';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { computeViewProj } from '../../../src/utils/camera/computeViewProj';
import { computeForegroundViewProj } from '../../../src/utils/camera/computeForegroundViewProj';
import { narrowMat4 } from '../../../src/utils/math/narrowMat4';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('computeForegroundViewProj', () => {
  it('with renderOrigin=[0,0,0] the narrowed result ≈ computeViewProj element-wise', () => {
    // Build a camera in the same way as orbitCamera.test.ts so the two paths
    // (f32 computeViewProj and f64 computeForegroundViewProj) operate on
    // identical geometry.
    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
    });

    // f32 reference
    const vpF32 = computeViewProj(cam);

    // f64 path with renderOrigin at the world origin — must narrow to ≈ same matrix.
    const vpF64 = computeForegroundViewProj({
      eyeMpc: cam.position,
      targetMpc: cam.target,
      up: [0, 1, 0],
      renderOrigin: [0, 0, 0],
      fovYRad: cam.fovYRad,
      aspect: cam.aspect,
      near: cam.near,
      far: cam.far,
    });

    const narrowed = narrowMat4(vpF64);

    // Each element must agree to f32 tolerance (toBeCloseTo default is 2 decimal
    // places, which is far looser than f32 precision — we tighten to 5 to catch
    // any formula divergence while staying well above f32 machine epsilon ~1e-7).
    for (let i = 0; i < 16; i++) {
      expect(narrowed[i] as number).toBeCloseTo(vpF32[i] as number, 5);
    }
  });

  it('eye/target far from origin but origin near them yields a finite, well-conditioned matrix', () => {
    // Place eye and target ~1 AU from the world origin, expressed in Mpc.
    // This mimics near-Earth rendering where the camera sits at solar-system
    // scale while the galaxy catalog lives at cosmological coordinates.
    const auInMpc = SCALE_UNITS.AU_TO_MPC;

    // A render origin placed close to the camera keeps eye−origin small, which
    // is the whole point of the renderOrigin subtraction.
    const renderOrigin: [number, number, number] = [auInMpc * 0.9, 0, 0];

    const eyeMpc: [number, number, number] = [auInMpc, 0, 0];
    const targetMpc: [number, number, number] = [0, 0, 0];

    const vp = computeForegroundViewProj({
      eyeMpc,
      targetMpc,
      up: [0, 1, 0],
      renderOrigin,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: auInMpc * 0.01,
      far: auInMpc * 10,
    });

    // Every element must be a finite number — NaN or Infinity means the
    // matrix degenerated (e.g. from catastrophic cancellation or a zero-length
    // view direction).
    for (let i = 0; i < 16; i++) {
      expect(Number.isFinite(vp[i] as number)).toBe(true);
    }

    // Non-degeneracy check: a point known to be inside the frustum (the world
    // origin, which is in front of the camera at distance ~1 AU relative to
    // renderOrigin) should project to finite NDC coordinates.
    //
    // The point in origin-relative coordinates is targetMpc − renderOrigin.
    const px = targetMpc[0] - renderOrigin[0];
    const py = targetMpc[1] - renderOrigin[1];
    const pz = targetMpc[2] - renderOrigin[2];

    // Manual mat4 * vec4 (column-major): vp is [c0r0, c0r1, c0r2, c0r3, c1r0, ...]
    const w =
      (vp[3] as number) * px +
      (vp[7] as number) * py +
      (vp[11] as number) * pz +
      (vp[15] as number) * 1;
    const cx =
      (vp[0] as number) * px +
      (vp[4] as number) * py +
      (vp[8] as number) * pz +
      (vp[12] as number) * 1;
    const cy =
      (vp[1] as number) * px +
      (vp[5] as number) * py +
      (vp[9] as number) * pz +
      (vp[13] as number) * 1;

    expect(Number.isFinite(cx / w)).toBe(true);
    expect(Number.isFinite(cy / w)).toBe(true);
    // w > 0 means the point is in front of the camera (inside the frustum).
    expect(w).toBeGreaterThan(0);
  });
});
