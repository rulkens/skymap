/**
 * labels3dNear0Layer tests — the NEAR0 sibling of labels3dLayer.test.ts. Same
 * enabled/draw shape, plus the camera-rebase math `near0VrRebasedVpF32` does
 * (mirroring `near0LabelProjection`, uncached — see the layer's header).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import {
  labels3dNear0Layer,
  near0VrRebasedVpF32,
} from '../../../../../src/services/engine/frame/passes/labels3dNear0Layer';
import { NEAR0, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { vrOverride } from '../../../../../src/services/xr/vrSpikeState';
import type { VrEye } from '../../../../../src/services/xr/vrSpikeState';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const PASS_STUB = {} as unknown as GPURenderPassEncoder;

function makeEye(camPos: Vec3): VrEye {
  return { camPos } as unknown as VrEye;
}

afterEach(() => {
  vrOverride.eyes = [];
});

function makeCtx(): ReadyFrameContext {
  const near0Slab: Slab = {
    index: NEAR0,
    nearMpc: 1e-9,
    farMpc: 1,
    vp: mat4d.identity() as Float64Array,
    originRelative: true,
    precision: 'f64',
    reversedZ: true,
  };
  return {
    isReady: true,
    slabs: [near0Slab, near0Slab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 0] as Readonly<[number, number, number]>,
    nowMs: 0,
    focusBlend: 0,
  } as unknown as ReadyFrameContext;
}

function makeState(
  over: { renderer?: unknown; glyphCount?: number; draw?: ReturnType<typeof vi.fn> } = {},
): EngineState {
  return {
    gpu: {
      label3DRendererNear0:
        over.renderer === undefined
          ? { draw: over.draw ?? vi.fn(), glyphCount: () => over.glyphCount ?? 1 }
          : over.renderer,
    },
  } as unknown as EngineState;
}

describe('labels3dNear0Layer.enabled', () => {
  it('is enabled whenever the NEAR0 renderer holds at least one glyph', () => {
    expect(labels3dNear0Layer.enabled(makeState({ glyphCount: 2 }), makeCtx())).toBe(true);
  });

  it('is disabled when glyphCount is 0', () => {
    expect(labels3dNear0Layer.enabled(makeState({ glyphCount: 0 }), makeCtx())).toBe(false);
  });

  it('is disabled when label3DRendererNear0 is null (pre-bootstrap)', () => {
    expect(labels3dNear0Layer.enabled(makeState({ renderer: null }), makeCtx())).toBe(false);
  });
});

describe('labels3dNear0Layer.draw', () => {
  it('draws the renderer with a rebased vp + this slab view’s viewport, when eyes are present', () => {
    vrOverride.eyes = [makeEye([1, 2, 3])];
    const draw = vi.fn();
    const state = makeState({ draw });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, NEAR0);

    labels3dNear0Layer.draw(PASS_STUB, view, ctx, state);

    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBeInstanceOf(Float32Array);
    expect(args[2]).toEqual(view.viewportPx);
  });

  it('is a no-op when no eyes are present (defensive — enabled() should already exclude this)', () => {
    vrOverride.eyes = [];
    const draw = vi.fn();
    const state = makeState({ draw });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, NEAR0);

    labels3dNear0Layer.draw(PASS_STUB, view, ctx, state);
    expect(draw).not.toHaveBeenCalled();
  });
});

describe('near0VrRebasedVpF32', () => {
  it('rebases an identity vp so a head-relative position maps through unchanged (zero head offset case)', () => {
    const vp = mat4d.identity() as Float64Array;
    const rebased = near0VrRebasedVpF32(vp, [0, 0, 0]);
    expect(Array.from(rebased)).toEqual(Array.from(new Float32Array(mat4d.identity())));
  });

  it('produces a DIFFERENT matrix when the head position is non-zero (the rebase actually moved)', () => {
    const vp = mat4d.perspective(1, 1, 0.01, 100) as Float64Array;
    const rebasedAtOrigin = near0VrRebasedVpF32(vp, [0, 0, 0]);
    const rebasedAtHead = near0VrRebasedVpF32(vp, [1e-9, 0, 0]);
    expect(Array.from(rebasedAtHead)).not.toEqual(Array.from(rebasedAtOrigin));
  });
});
