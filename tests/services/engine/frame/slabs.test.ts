/**
 * slabs — unit tests for `deriveSlabs` and `slabViewOf`.
 *
 * `deriveSlabs` instantiates the spec's two-row slab table (near-field
 * bodies + cosmological scene) from the live camera and the already-computed
 * cosmological view-proj. `slabViewOf` is the executor-side lookup that
 * resolves a `slab: number` index (as named by a `FrameStep`) into the
 * `SlabView` a layer's `draw` actually consumes.
 */

import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import type { Mat4 } from 'wgpu-matrix';

import { deriveSlabs, slabViewOf, NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import { createOrbitCamera } from '../../../../src/utils/camera/createOrbitCamera';
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
    for (const slab of slabs) {
      expect(slab.nearMpc).toBeLessThan(slab.farMpc);
    }
  });

  it('the near-field row is origin-relative and f64; the cosmological row is not origin-relative and f32', () => {
    const slabs = deriveSlabs(makeCam(100), makeCosmoVp());
    expect(slabs[0]?.originRelative).toBe(true);
    expect(slabs[0]?.precision).toBe('f64');
    expect(slabs[1]?.originRelative).toBe(false);
    expect(slabs[1]?.precision).toBe('f32');
  });

  it('the near-field row uses an adaptive near/far derived from cam.distance', () => {
    const distance = 250;
    const slabs = deriveSlabs(makeCam(distance), makeCosmoVp());
    expect(slabs[0]?.nearMpc).toBeCloseTo(distance * 1e-4, 10);
    expect(slabs[0]?.farMpc).toBeCloseTo(distance * 100, 10);
  });

  it('the cosmological row preserves the given vp exactly', () => {
    const cosmoVp = makeCosmoVp();
    const slabs = deriveSlabs(makeCam(100), cosmoVp);
    // Widening f32 -> f64 is exact, so narrowing back to f32 round-trips
    // byte-equal — this is what lets `slabViewOf` skip a COSMO special case.
    expect(Array.from(Float32Array.from(slabs[1]!.vp))).toEqual(Array.from(cosmoVp));
  });
});

describe('slabViewOf', () => {
  function makeReadyCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
    const cam = makeCam(100);
    const cosmoVp = makeCosmoVp();
    const slabs = deriveSlabs(cam, cosmoVp);
    return {
      isReady: true,
      cam,
      vp: cosmoVp,
      canvasSize: { width: 1920, height: 1080 },
      drawCamPos: [cam.position[0], cam.position[1], cam.position[2]],
      drawPxPerRad: 1000,
      nowMs: 0,
      fovYRad: cam.fovYRad,
      focusBlend: 0,
      visibleSourceMask: 0xffffffff,
      focus: { blend: 0 } as unknown as ReadyFrameContext['focus'],
      renderer: {} as unknown as ReadyFrameContext['renderer'],
      postProcess: {} as unknown as ReadyFrameContext['postProcess'],
      volumeOffscreen: {} as unknown as ReadyFrameContext['volumeOffscreen'],
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
    expect(view.slab.nearMpc).toBeCloseTo(cam.distance * 1e-4, 10);
    expect(view.slab.farMpc).toBeCloseTo(cam.distance * 100, 10);
  });

  it('throws for an index with no matching slab row', () => {
    const ctx = makeReadyCtx();
    expect(() => slabViewOf(ctx, 99)).toThrow();
  });
});
