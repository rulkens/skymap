/**
 * zoneOfAvoidanceUpsampleLayer tests — the consumer half of the reduced-res
 * band: the hdr-target layer that composites the reduced-res `zoa` offscreen into HDR
 * (`state.gpu.zoneOfAvoidanceUpsample`) and then draws the full-res curved
 * lettering via the shared `label3DRenderer.draw` — the two halves are
 * independently null-guarded, so either GPU handle being absent
 * pre-bootstrap doesn't silence the other.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { zoneOfAvoidanceUpsampleLayer } from '../../../../../src/services/engine/frame/passes/zoneOfAvoidanceUpsampleLayer';
import { COSMO, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';
import { makeCosmoSlab } from '../../../../fixtures/makeCosmoSlab';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

/** Inside the visibility window: both bands saturate to 1 here. */
const INSIDE_CAM_DIST = SCALE_FADE_BANDS.zoneOfAvoidance.fullAt;

const ZOA_VIEW = { __id: 'zoa-view' } as unknown as GPUTextureView;

function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const vp = new Float32Array(16) as unknown as Mat4;
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  return {
    isReady: true,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, INSIDE_CAM_DIST] as Readonly<[number, number, number]>,
    nowMs: 0,
    focusBlend: 0,
    renderTargets: {
      viewOf: (id: string) => (id === 'zoa' ? ZOA_VIEW : ({} as GPUTextureView)),
    } as never,
    ...over,
  } as unknown as ReadyFrameContext;
}

function makeState(
  over: {
    upsampleDraw?: ReturnType<typeof vi.fn>;
    labelDraw?: ReturnType<typeof vi.fn>;
    glyphCount?: number;
    upsample?: unknown;
    label3D?: unknown;
    renderer?: unknown;
  } = {},
): EngineState {
  return {
    gpu: {
      zoneOfAvoidanceUpsample:
        over.upsample === undefined
          ? { draw: over.upsampleDraw ?? vi.fn(), destroy: vi.fn() }
          : over.upsample,
      zoneOfAvoidanceRenderer:
        over.renderer === undefined ? { draw: vi.fn(), drawPick: vi.fn() } : over.renderer,
      label3DRenderer:
        over.label3D === undefined
          ? { draw: over.labelDraw ?? vi.fn(), glyphCount: () => over.glyphCount ?? 1 }
          : over.label3D,
    },
    settings: { zoneOfAvoidance: { labelColor: [1, 1, 1], intensity: 1 } },
    subsystems: {
      fades: { opacityOf: () => 1 },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

describe('zoneOfAvoidanceUpsampleLayer.enabled', () => {
  it('is enabled when the camera sits inside the visibility window', () => {
    const ctx = makeCtx();
    expect(zoneOfAvoidanceUpsampleLayer.enabled(makeState(), ctx, slabViewOf(ctx, COSMO))).toBe(
      true,
    );
  });

  it('is disabled once the camera is past the recede band', () => {
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const ctx = makeCtx({ drawCamPos: [0, 0, goneAt * 10] as Readonly<[number, number, number]> });
    expect(zoneOfAvoidanceUpsampleLayer.enabled(makeState(), ctx, slabViewOf(ctx, COSMO))).toBe(
      false,
    );
  });

  it('is disabled when zoneOfAvoidanceRenderer is null (pre-bootstrap)', () => {
    const ctx = makeCtx();
    expect(
      zoneOfAvoidanceUpsampleLayer.enabled(
        makeState({ renderer: null }),
        ctx,
        slabViewOf(ctx, COSMO),
      ),
    ).toBe(false);
  });
});

describe('zoneOfAvoidanceUpsampleLayer.draw', () => {
  it('composites the zoa offscreen into HDR and draws the full-res lettering', () => {
    const upsampleDraw = vi.fn();
    const labelDraw = vi.fn();
    const state = makeState({ upsampleDraw, labelDraw });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state);

    expect(upsampleDraw).toHaveBeenCalledTimes(1);
    expect(upsampleDraw.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(upsampleDraw.mock.calls[0]![1]).toBe(ZOA_VIEW);

    expect(labelDraw).toHaveBeenCalledTimes(1);
    const labelArgs = labelDraw.mock.calls[0]!;
    // label3DRenderer.draw(pass, viewProj, viewportPx) — full-res: the
    // resolved SlabView's vp/viewportPx, NOT a downscaled one.
    expect(labelArgs[0]).toBe(PASS_STUB);
    expect(labelArgs[1]).toBe(view.vp);
    expect(labelArgs[2]).toEqual(view.viewportPx);
  });

  it('skips the blit but still draws labels when zoneOfAvoidanceUpsample is null', () => {
    const labelDraw = vi.fn();
    const state = makeState({ upsample: null, labelDraw });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(() => zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state)).not.toThrow();
    expect(labelDraw).toHaveBeenCalledTimes(1);
  });

  it('skips the labels but still blits when label3DRenderer is null', () => {
    const upsampleDraw = vi.fn();
    const state = makeState({ upsampleDraw, label3D: null });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(() => zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state)).not.toThrow();
    expect(upsampleDraw).toHaveBeenCalledTimes(1);
  });

  it('skips the labels but still blits when glyphCount is 0 (no lettering to draw)', () => {
    const upsampleDraw = vi.fn();
    const labelDraw = vi.fn();
    const state = makeState({ upsampleDraw, labelDraw, glyphCount: 0 });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state);
    expect(upsampleDraw).toHaveBeenCalledTimes(1);
    expect(labelDraw).not.toHaveBeenCalled();
  });

  it('is a no-op when both handles are null (pre-bootstrap)', () => {
    const state = makeState({ upsample: null, label3D: null });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(() => zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state)).not.toThrow();
  });
});
