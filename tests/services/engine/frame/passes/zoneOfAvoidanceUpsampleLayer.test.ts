/**
 * zoneOfAvoidanceUpsampleLayer tests — the consumer half of the reduced-res
 * band: the hdr-target layer that composites the reduced-res `zoa` offscreen
 * into HDR (`state.gpu.zoneOfAvoidanceUpsample`). The full-res curved
 * lettering it used to draw via `postBlit` now has its own draw site,
 * `labels3dLayer` — see that layer's own test file.
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
    frame: { kind: 'world-mpc', originRelative: false },
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
        over.renderer === undefined ? { draw: vi.fn(), drawPick: vi.fn() } : over.renderer,
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
  it('composites the zoa offscreen into HDR', () => {
    const upsampleDraw = vi.fn();
    const state = makeState({ upsampleDraw });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state);

    expect(upsampleDraw).toHaveBeenCalledTimes(1);
    expect(upsampleDraw.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(upsampleDraw.mock.calls[0]![1]).toBe(ZOA_VIEW);
  });

  it('is a no-op when zoneOfAvoidanceUpsample is null (pre-bootstrap)', () => {
    const state = makeState({ upsample: null });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(() => zoneOfAvoidanceUpsampleLayer.draw(PASS_STUB, view, ctx, state)).not.toThrow();
  });
});
