/**
 * applyVrEyeToCtx must stamp a per-eye billboard basis (right/up, world
 * space) so the Milky Way layers billboard against the eye that's actually
 * drawing, not the frozen mono orbit camera — see milkyWayLayer.ts. The
 * regression this guards against: reading the wrong row/column of the eye's
 * view matrix silently produces a plausible-looking but wrong basis (no
 * crash, just skewed splats), so this pins the extraction against a basis
 * asymmetric enough that a row/column mix-up would fail it.
 */

import { describe, it, expect } from 'vitest';

import { applyVrEyeToCtx, viewFromBasis } from '../../../src/services/xr/vrSpikeState';
import type { VrEye, VrBillboardBasis } from '../../../src/services/xr/vrSpikeState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Deliberately not axis-aligned with X/Y/Z in the same order as identity, so a
// transposed read of the view matrix (row vs. column) produces a different,
// still-plausible-looking answer instead of accidentally matching.
const RIGHT: Vec3 = [0, 1, 0];
const UP: Vec3 = [0, 0, 1];
const BACK: Vec3 = [1, 0, 0];
const EYE_POS: Vec3 = [2, 3, 4];

function makeEye(): VrEye {
  return {
    viewCosmo: viewFromBasis(new Float32Array(16), RIGHT, UP, BACK, EYE_POS),
    viewNear0: viewFromBasis(new Float64Array(16), RIGHT, UP, BACK, EYE_POS),
    tan: { l: -1, r: 1, d: -1, u: 1 },
    camPos: EYE_POS,
    textureView: {} as GPUTextureView,
  };
}

function makeCtx(): ReadyFrameContext {
  const near0 = { index: 0, nearMpc: 0.001, farMpc: 1, vp: new Float64Array(16) };
  const cosmo = { index: 1, nearMpc: 10, farMpc: 5000, vp: new Float64Array(16) };
  return {
    slabs: [near0, cosmo],
    renderedTargets: new Set<string>(['stale-from-previous-eye']),
  } as unknown as ReadyFrameContext;
}

describe('applyVrEyeToCtx', () => {
  it('stamps the eye world-space right/up axes, not the frozen mono camera basis', () => {
    const ctx = makeCtx();
    applyVrEyeToCtx(ctx, makeEye());

    const basis = (ctx as unknown as { vrBillboardBasis?: VrBillboardBasis }).vrBillboardBasis;
    expect(basis).toBeDefined();
    expect(basis!.right).toEqual(RIGHT);
    expect(basis!.up).toEqual(UP);
  });

  it('also resets renderedTargets so the next eye redraws every target', () => {
    const ctx = makeCtx();
    applyVrEyeToCtx(ctx, makeEye());
    expect((ctx.renderedTargets as Set<string>).size).toBe(0);
  });
});
