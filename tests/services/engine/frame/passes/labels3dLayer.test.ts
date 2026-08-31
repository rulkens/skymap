/**
 * labels3dLayer tests — the shared Label3D draw site. Regression coverage
 * for the bug this layer fixes: it used to draw only from
 * `zoneOfAvoidanceUpsampleLayer`'s `postBlit`, gated on ZoA-band liveness
 * (a camera-distance opacity), so any Label3D producer's output (including
 * VR labels) never reached the screen outside the band's cosmological
 * visibility window. This layer instead gates on the renderer's own glyph
 * count alone.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { labels3dLayer } from '../../../../../src/services/engine/frame/passes/labels3dLayer';
import { COSMO, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';

const PASS_STUB = {} as unknown as GPURenderPassEncoder;

function makeCtx(): ReadyFrameContext {
  const vp = new Float32Array(16) as unknown as Mat4;
  const cosmoSlab: Slab = {
    index: COSMO,
    nearMpc: 0.01,
    farMpc: 50000,
    vp: Float64Array.from(vp as unknown as Float32Array),
    originRelative: false,
    precision: 'f32',
    reversedZ: false,
  };
  return {
    isReady: true,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 1e6] as Readonly<[number, number, number]>,
    nowMs: 0,
    focusBlend: 0,
  } as unknown as ReadyFrameContext;
}

function makeState(over: { label3D?: unknown; glyphCount?: number; draw?: ReturnType<typeof vi.fn> } = {}): EngineState {
  return {
    gpu: {
      label3DRenderer:
        over.label3D === undefined
          ? { draw: over.draw ?? vi.fn(), glyphCount: () => over.glyphCount ?? 1 }
          : over.label3D,
    },
  } as unknown as EngineState;
}

describe('labels3dLayer.enabled', () => {
  it('is enabled whenever the renderer holds at least one glyph, regardless of camera distance', () => {
    // drawCamPos is 1e6 Mpc — far past any ZoA-band visibility window — yet
    // this layer stays enabled: it no longer inherits that gate.
    expect(labels3dLayer.enabled(makeState({ glyphCount: 3 }), makeCtx())).toBe(true);
  });

  it('is disabled when glyphCount is 0 (no producer emitted anything this frame)', () => {
    expect(labels3dLayer.enabled(makeState({ glyphCount: 0 }), makeCtx())).toBe(false);
  });

  it('is disabled when label3DRenderer is null (pre-bootstrap)', () => {
    expect(labels3dLayer.enabled(makeState({ label3D: null }), makeCtx())).toBe(false);
  });
});

describe('labels3dLayer.draw', () => {
  it('draws the renderer with this slab view\'s full-res vp + viewport', () => {
    const draw = vi.fn();
    const state = makeState({ draw });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    labels3dLayer.draw(PASS_STUB, view, ctx, state);

    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(view.vp);
    expect(args[2]).toEqual(view.viewportPx);
  });
});
