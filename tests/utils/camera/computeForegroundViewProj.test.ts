import { describe, it, expect } from 'vitest';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { computeViewProj } from '../../../src/utils/camera/computeViewProj';
import { computeForegroundViewProj } from '../../../src/utils/camera/computeForegroundViewProj';
import { foregroundFrustum } from '../../../src/utils/camera/foregroundFrustum';
import { narrowMat4 } from '../../../src/utils/math/narrowMat4';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { NEAR0, SLAB_REVERSED_Z } from '../../../src/services/engine/frame/slabs';
import { depthClearValueFor } from '../../../src/utils/gpu/depthClearValueFor';

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
      reversedZ: false,
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
      reversedZ: false,
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

  it('Sun depth from an Earth-view frustum is resolvable from the far clear', () => {
    // WHY this test exists: this is the original depth-fighting bug, as pure
    // matrix math. When focused on Earth the camera's orbit distance is ~1e-15
    // Mpc, so the near-field bracket is roughly [1e-19, 3e-11] Mpc — a ~1e8
    // near/far ratio. The Sun sits at 1 AU (≈4.85e-12 Mpc) along the view axis,
    // near the far end of that bracket.
    //
    // The disk is stored in a `depth32float` buffer, so what matters is not the
    // raw f64 NDC distance from the clear but whether float32 can DISTINGUISH the
    // Sun's depth from the cleared far plane. We therefore quantize the projected
    // NDC depth with `Math.fround` — exactly what the GPU does on write.
    //
    // On the NON-reversed path (near→0, far→1, clear 1.0) a finite perspective
    // crowds nearly all its depth resolution against the near plane, so the Sun
    // projects to 1 − ~1.7e-8. The float32 spacing just below 1.0 is ~6e-8, so
    // that rounds to EXACTLY 1.0 — the clear. The disk quantizes onto the far
    // plane and flickers against the cleared background (the shipped bug). The
    // rejected "fix" of nudging near/far or adding a depth bias only moves the
    // cliff; it does not give the far shell honest precision.
    //
    // Under infinite-far reversed-Z (near→1, ∞→0, clear 0.0) the Sun projects to
    // ~2.1e-8 above the 0.0 clear. float32 near zero is enormously dense (down to
    // denormals ~1e-45), so 2.1e-8 stays perfectly representable and distinct
    // from 0 → resolvable. Deriving BOTH `reversedZ` and `clear` from the slab
    // constant makes this a genuine regression guard: RED on the pre-flip
    // `SLAB_REVERSED_Z[NEAR0] === false` (quantizes onto the clear) and GREEN
    // once the flag flips.
    const reversedZ = SLAB_REVERSED_Z[NEAR0]!;
    const clear = depthClearValueFor(reversedZ);

    // Earth-focus camDistance → the same adaptive bracket deriveSlabs uses.
    const { near, far } = foregroundFrustum(1e-15);

    const vp = computeForegroundViewProj({
      eyeMpc: [0, 0, 0],
      targetMpc: [0, 0, -1],
      up: [0, 1, 0],
      renderOrigin: [0, 0, 0],
      fovYRad: Math.PI / 4,
      aspect: 1,
      near,
      far,
      reversedZ,
    });

    // The Sun at 1 AU along the view axis (looking down −z), origin-relative.
    const sun: [number, number, number] = [0, 0, -4.85e-12];

    // Manual mat4 * vec4 (column-major): vp is [c0r0, c0r1, c0r2, c0r3, c1r0, ...].
    const clipZ =
      (vp[2] as number) * sun[0] +
      (vp[6] as number) * sun[1] +
      (vp[10] as number) * sun[2] +
      (vp[14] as number) * 1;
    const clipW =
      (vp[3] as number) * sun[0] +
      (vp[7] as number) * sun[1] +
      (vp[11] as number) * sun[2] +
      (vp[15] as number) * 1;

    // Quantize as the depth32float buffer would on write.
    const ndcDepth = Math.fround(clipZ / clipW);

    // A stored depth distinguishable from the clear ⇒ the disk resolves against
    // the cleared far plane. On the non-reversed path `ndcDepth` rounds to
    // exactly the 1.0 clear (diff 0) and this fails — the bug, reproduced. Under
    // reversed-Z it lands ~2.1e-8 from the 0.0 clear, well outside a float32 ulp
    // near zero, and passes.
    expect(ndcDepth).not.toBe(clear);
  });
});
