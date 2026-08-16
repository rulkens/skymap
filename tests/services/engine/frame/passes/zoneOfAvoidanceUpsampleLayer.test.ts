/**
 * zoneOfAvoidanceUpsampleLayer tests — the CONSUMER half of gate-fix 6: the
 * hdr-target layer that composites the reduced-res `zoa` offscreen into HDR
 * (`state.gpu.zoneOfAvoidanceUpsample`) and then draws the band's full-res
 * curved lettering (`state.gpu.zoneOfAvoidanceRenderer.drawLabels`) — the two
 * halves are independently null-guarded, so either GPU handle being absent
 * pre-bootstrap doesn't silence the other.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { zoneOfAvoidanceUpsampleLayer } from '../../../../../src/services/engine/frame/passes/zoneOfAvoidanceUpsampleLayer';
import { COSMO, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';
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
    labelsDraw?: ReturnType<typeof vi.fn>;
    upsample?: unknown;
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
        over.renderer === undefined
          ? { draw: vi.fn(), drawLabels: over.labelsDraw ?? vi.fn() }
          : over.renderer,
    },
    settings: { zoneOfAvoidance: { labelColor: [1, 1, 1], intensity: 1 } },
    subsystems: { fades: { opacityOf: () => 1 } },
  } as unknown as EngineState;
}

describe('zoneOfAvoidanceUpsampleLayer.enabled', () => {
  it('is enabled when the camera sits inside the visibility window', () => {
    expect(zoneOfAvoidanceUpsampleLayer.enabled(makeState(), makeCtx())).toBe(true);
  });

  it('is disabled once the camera is past the recede band', () => {
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const ctx = makeCtx({ drawCamPos: [0, 0, goneAt * 10] as Readonly<[number, number, number]> });
    expect(zoneOfAvoidanceUpsampleLayer.enabled(makeState(), ctx)).toBe(false);
  });

  it('is disabled when zoneOfAvoidanceRenderer is null (pre-bootstrap)', () => {
    expect(zoneOfAvoidanceUpsampleLayer.enabled(makeState({ renderer: null }), makeCtx())).toBe(
      false,
    );
  });
});

describe('zoneOfAvoidanceUpsampleLayer.draw', () => {
  it('composites the zoa offscreen into HDR and draws the full-res lettering', () => {
    const upsampleDraw = vi.fn();
    const labelsDraw = vi.fn();
    const state = makeState({ upsampleDraw, labelsDraw });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state);

    expect(upsampleDraw).toHaveBeenCalledTimes(1);
    expect(upsampleDraw.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(upsampleDraw.mock.calls[0]![1]).toBe(ZOA_VIEW);

    expect(labelsDraw).toHaveBeenCalledTimes(1);
    const labelArgs = labelsDraw.mock.calls[0]!;
    // drawLabels(pass, viewProj, viewportPx, tuning, labelRadiusMpc, opacity)
    // — full-res: the resolved SlabView's vp/viewportPx, NOT a downscaled one.
    expect(labelArgs[0]).toBe(PASS_STUB);
    expect(labelArgs[1]).toBe(view.vp);
    expect(labelArgs[2]).toEqual(view.viewportPx);
    expect(labelArgs[3]).toBe(state.settings.zoneOfAvoidance);
    expect(typeof labelArgs[4]).toBe('number'); // labelRadiusMpc
    expect(labelArgs[5]).toBeCloseTo(1, 6); // opacity
  });

  it('skips the blit but still draws labels when zoneOfAvoidanceUpsample is null', () => {
    const labelsDraw = vi.fn();
    const state = makeState({ upsample: null, labelsDraw });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(() => zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state)).not.toThrow();
    expect(labelsDraw).toHaveBeenCalledTimes(1);
  });

  it('skips the labels but still blits when zoneOfAvoidanceRenderer is null', () => {
    const upsampleDraw = vi.fn();
    const state = makeState({ upsampleDraw, renderer: null });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(() => zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state)).not.toThrow();
    expect(upsampleDraw).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when both handles are null (pre-bootstrap)', () => {
    const state = makeState({ upsample: null, renderer: null });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(() => zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state)).not.toThrow();
  });
});
