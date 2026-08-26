/**
 * slabs — unit tests for `deriveSlabs` and `slabViewOf`.
 *
 * `deriveSlabs` instantiates the two-row slab table (near-field bodies and the
 * cosmological scene) from the live camera and the already-computed
 * cosmological view-proj. `slabViewOf` is the executor-side lookup that
 * resolves a `slab: number` index (as named by a `FrameStep`) into the
 * `SlabView` a layer's `draw` actually consumes.
 */

import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import type { Mat4 } from 'wgpu-matrix';

import { deriveSlabs, slabViewOf, NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import { createOrbitCamera } from '../../../../src/utils/camera/createOrbitCamera';
import { computeForegroundViewProj } from '../../../../src/utils/camera/computeForegroundViewProj';
import { foregroundFrustum } from '../../../../src/utils/camera/foregroundFrustum';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

function makeCam(distance: number): OrbitCamera {
  return createOrbitCamera({
    target: [0, 0, 0],
    yaw: 0.3,
    pitch: 0.1,
    distance,
    fovYRad: 1,
    aspect: 16 / 9,
    near: 0.1,
    far: 10000,
  });
}

/** A distinctive, non-identity Mat4 so byte-equality checks aren't vacuous. */
function makeCosmoVp(): Mat4 {
  return mat4.perspective(1, 16 / 9, 0.01, 50000);
}

describe('deriveSlabs', () => {
  it('returns two rows with index === array position', () => {
    const slabs = deriveSlabs(makeCam(100), makeCosmoVp());
    expect(slabs).toHaveLength(2);
    expect(slabs[0]?.index).toBe(NEAR0);
    expect(slabs[1]?.index).toBe(COSMO);
  });

  it.each([5, 5000])('every slab has nearMpc < farMpc (cam.distance = %d)', (distance) => {
    const slabs = deriveSlabs(makeCam(distance), makeCosmoVp());
    for (const index of [NEAR0, COSMO]) {
      expect(slabs[index]!.nearMpc).toBeLessThan(slabs[index]!.farMpc);
    }
  });

  it('the near-field row is origin-relative and f64; the cosmological row is not origin-relative and f32', () => {
    const slabs = deriveSlabs(makeCam(100), makeCosmoVp());
    expect(slabs[0]?.frame).toEqual({ kind: 'world-mpc', originRelative: true });
    expect(slabs[0]?.precision).toBe('f64');
    expect(slabs[0]?.reversedZ).toBe(true);
    expect(slabs[1]?.frame).toEqual({ kind: 'world-mpc', originRelative: false });
    expect(slabs[1]?.precision).toBe('f32');
    expect(slabs[1]?.reversedZ).toBe(false);
  });

  it.each([250, 5000])(
    'the near-field row uses an adaptive near/far derived from cam.distance (%d)',
    (distance) => {
      const slabs = deriveSlabs(makeCam(distance), makeCosmoVp());
      const { near, far } = foregroundFrustum(distance);
      expect(slabs[0]?.nearMpc).toBe(near);
      expect(slabs[0]?.farMpc).toBe(far);
    },
  );

  it("the near row's vp is the origin-relative computeForegroundViewProj product", () => {
    const distance = 250;
    const cam = makeCam(distance);
    const slabs = deriveSlabs(cam, makeCosmoVp());
    // Pin the util as the derivation: rebuild the matrix from the same camera
    // inputs and assert Float64Array equality. A reimplemented-but-equal matrix
    // would drift the moment computeForegroundViewProj changes, so equality
    // against the live util — not a hand-rolled expectation — is the contract.
    const { near, far } = foregroundFrustum(distance);
    const expected = computeForegroundViewProj({
      eyeMpc: cam.position,
      targetMpc: cam.target,
      up: [0, 1, 0],
      renderOrigin: RENDER_ORIGIN_MPC,
      fovYRad: cam.fovYRad,
      aspect: cam.aspect,
      near,
      far,
      // NEAR0 is reversed-Z (`SLAB_REVERSED_Z[NEAR0] === true`), so the derived
      // vp must be the infinite-far reversed projection — pin the util with the
      // same flag deriveSlabs passes, else this equality drifts.
      reversedZ: true,
    });
    expect(slabs[0]?.vp).toBeInstanceOf(Float64Array);
    expect(Array.from(slabs[0]!.vp)).toEqual(Array.from(expected));
  });

  it('the cosmological row preserves the given vp exactly', () => {
    const cosmoVp = makeCosmoVp();
    const slabs = deriveSlabs(makeCam(100), cosmoVp);
    // Widening f32 -> f64 is exact, so narrowing back to f32 round-trips
    // byte-equal — this is what lets `slabViewOf` skip a COSMO special case.
    expect(Array.from(Float32Array.from(slabs[1]!.vp))).toEqual(Array.from(cosmoVp));
  });

  it('with a pivot radius, keys the near-field bracket off ALTITUDE, not raw distance', () => {
    // At a realistic close-approach altitude (50 m, comfortably above the
    // ~15 m descent floor) the pivot's own radius utterly dominates raw
    // `cam.distance`, so this is the actual regime the bug lived in: two very
    // differently sized pivots at the SAME altitude must still get the same
    // near/far.
    const altitudeMpc = 0.05 * SCALE_UNITS.KM_TO_MPC; // 50 m
    const moonletRadiusMpc = 10 * SCALE_UNITS.KM_TO_MPC;
    const earthRadiusMpc = 6371 * SCALE_UNITS.KM_TO_MPC;
    const a = deriveSlabs(makeCam(moonletRadiusMpc + altitudeMpc), makeCosmoVp(), moonletRadiusMpc);
    const b = deriveSlabs(makeCam(earthRadiusMpc + altitudeMpc), makeCosmoVp(), earthRadiusMpc);
    const relDiff = Math.abs(a[0]!.nearMpc - b[0]!.nearMpc) / a[0]!.nearMpc;
    expect(relDiff).toBeLessThan(1e-9);
    expect(a[0]!.farMpc).toBe(b[0]!.farMpc);

    // Without the fix (keying off raw `cam.distance`), Earth's pivot would get
    // a near plane over an order of magnitude farther out than the
    // altitude-keyed one — comfortably past the 50 m altitude, i.e. the
    // ground-clipping bug.
    const rawDistanceBracket = foregroundFrustum(earthRadiusMpc + altitudeMpc);
    expect(rawDistanceBracket.near / b[0]!.nearMpc).toBeGreaterThan(10);
  });

  it('with no pivot radius (default), behaves exactly as before — raw distance', () => {
    const distance = 250;
    const slabs = deriveSlabs(makeCam(distance), makeCosmoVp());
    const { near, far } = foregroundFrustum(distance);
    expect(slabs[0]!.nearMpc).toBe(near);
    expect(slabs[0]!.farMpc).toBe(far);
  });
});

describe('slabViewOf', () => {
  function makeReadyCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
    const cam = makeCam(100);
    const cosmoVp = makeCosmoVp();
    const slabs = deriveSlabs(cam, cosmoVp);
    return {
      isReady: true,
      renderedTargets: new Set<string>(),
      cam,
      vp: cosmoVp,
      canvasSize: { width: 1920, height: 1080 },
      drawCamPos: [cam.position[0], cam.position[1], cam.position[2]],
      drawPxPerRad: 1000,
      nowMs: 0,
      simDays: 0,
      fovYRad: cam.fovYRad,
      focusBlend: 0,
      visibleSourceMask: 0xffffffff,
      focus: { blend: 0 } as unknown as ReadyFrameContext['focus'],
      galaxyPointRenderer: {} as unknown as ReadyFrameContext['galaxyPointRenderer'],
      renderTargets: {} as unknown as ReadyFrameContext['renderTargets'],
      texturedDisks: {} as unknown as ReadyFrameContext['texturedDisks'],
      slabs,
      ...overrides,
    };
  }

  it('slabViewOf(ctx, COSMO).vp is byte-equal to ctx.vp', () => {
    const ctx = makeReadyCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(Array.from(view.vp)).toEqual(Array.from(Float32Array.from(ctx.vp)));
  });

  it('slabViewOf viewportPx mirrors canvasSize', () => {
    const ctx = makeReadyCtx({ canvasSize: { width: 800, height: 600 } });
    const view = slabViewOf(ctx, COSMO);
    expect(view.viewportPx).toEqual([800, 600]);
  });

  it('slabViewOf(ctx, NEAR0) exposes the adaptive near/far slab row', () => {
    const cam = makeCam(100);
    const ctx = makeReadyCtx({ cam });
    const view = slabViewOf(ctx, NEAR0);
    const { near, far } = foregroundFrustum(cam.distance);
    expect(view.slab.nearMpc).toBe(near);
    expect(view.slab.farMpc).toBe(far);
  });

  it('throws for an index with no matching slab row', () => {
    const ctx = makeReadyCtx();
    expect(() => slabViewOf(ctx, 99)).toThrow();
  });
});
