/**
 * The NEAR0 overlay's clip `w` band: perspective-correct interpolation is
 * faithful only within a magnitude band (SwiftShader ~1e-12 … 1e11; hardware
 * wider but finite). Pinned through the real projection, from the nearest to
 * the farthest content the slab draws, at two camera scales: standing on a
 * surface and a galaxy out.
 */

import { describe, expect, it } from 'vitest';
import { vec4 } from 'wgpu-matrix';

import { near0LabelProjection } from '../../../../src/services/engine/frame/near0LabelProjection';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { foregroundFrustum } from '../../../../src/utils/camera/foregroundFrustum';
import { computeForegroundViewProj } from '../../../../src/utils/camera/computeForegroundViewProj';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

const EYE = [2, 3, 5] as const;

function ctxAt(camDistanceMpc: number): { ctx: FrameView; near: number; far: number } {
  const { near, far } = foregroundFrustum(camDistanceMpc);
  const vp = computeForegroundViewProj({
    eyeMpc: EYE,
    targetMpc: [EYE[0], EYE[1], EYE[2] + 1],
    up: [0, 1, 0],
    renderOrigin: [0, 0, 0],
    frustum: symmetricFrustum(1, 16 / 9),
    near,
    far,
    reversedZ: true,
  });
  const slab = {
    index: NEAR0,
    near,
    far,
    vp,
    frame: { kind: 'world-mpc', originRelative: true },
  } as Slab;
  const ctx = {
    slabs: [slab],
    drawCamPos: EYE,
    canvasSize: { width: 1280, height: 720 },
    drawPxPerRad: 900,
  } as unknown as FrameView;
  return { ctx, near, far };
}

/** Clip `w` of a point `aheadMpc` along the view axis, through the overlay's upload matrix. */
function clipW(ctx: FrameView, aheadMpc: number): number {
  const { vpF32 } = near0LabelProjection(ctx);
  // The overlay matrices are rebased about the camera: positions are eye-relative.
  return vec4.transformMat4([0, 0, aheadMpc, 1], vpF32)[3]!;
}

describe('near0OverlayClipScale', () => {
  it.each([
    ['standing on a surface', 1e-16],
    ['an orbit out', 1e-9],
    ['a galaxy out', 0.05],
  ])(
    'keeps the overlay clip w in the rasterizer band from the near plane to the far plane (%s)',
    (_, dist) => {
      const { ctx, near, far } = ctxAt(dist);
      expect(clipW(ctx, near)).toBeCloseTo(1, 6);
      expect(clipW(ctx, far)).toBeCloseTo(far / near, 3);
      for (const d of [near, Math.sqrt(near * far), far]) {
        const w = clipW(ctx, d);
        expect(w).toBeGreaterThanOrEqual(1e-12);
        expect(w).toBeLessThanOrEqual(1e11);
      }
    },
  );

  it('hands the label draw the same scale the matrix carries', () => {
    const { ctx, near } = ctxAt(1e-9);
    expect(near0LabelProjection(ctx).clipScale * near).toBeCloseTo(1, 12);
  });
});
