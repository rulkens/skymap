/**
 * zoneOfAvoidanceUpsamplePass tests — the consumer half of the reduced-res
 * band: the hdr-target layer that composites the reduced-res `zoa` offscreen
 * into HDR (`runtime.upsample`).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { zoneOfAvoidanceUpsamplePass } from '../../../../src/layers/zoneOfAvoidance/passes/zoneOfAvoidanceUpsamplePass';
import { COSMO, slabViewOf } from '../../../../src/services/engine/frame/slabs';
import { MILKY_WAY_RADIUS_MPC } from '../../../../src/data/milkyWay/milkyWayRadiusMpc';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { ZoneOfAvoidanceRuntime } from '../../../../src/layers/zoneOfAvoidance/@types/ZoneOfAvoidanceRuntime';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const INSIDE_CAM_DIST = MILKY_WAY_RADIUS_MPC * 10;

const ZOA_VIEW = { __id: 'zoa-view' } as unknown as GPUTextureView;

function makeCtx(): FrameView {
  const vp = new Float32Array(16) as unknown as Mat4;
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  return {
    snapshot: {
      isReady: true,
      nowMs: 0,
      focusBlend: 0,
      renderTargets: {
        viewOf: (id: string) => (id === 'zoa' ? ZOA_VIEW : ({} as GPUTextureView)),
      } as never,
    },
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, INSIDE_CAM_DIST] as Readonly<[number, number, number]>,
  } as unknown as FrameView;
}

function makeRuntime(upsampleDraw?: ReturnType<typeof vi.fn>): ZoneOfAvoidanceRuntime {
  return {
    upsample: { draw: upsampleDraw ?? vi.fn(), destroy: vi.fn() },
  } as unknown as ZoneOfAvoidanceRuntime;
}

describe('zoneOfAvoidanceUpsamplePass.draw', () => {
  it('composites the zoa offscreen into HDR', () => {
    const upsampleDraw = vi.fn();
    const pass = zoneOfAvoidanceUpsamplePass(makeRuntime(upsampleDraw));
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    pass.draw(PASS_STUB, view, ctx, {} as EngineState, 1);

    expect(upsampleDraw).toHaveBeenCalledTimes(1);
    expect(upsampleDraw.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(upsampleDraw.mock.calls[0]![1]).toBe(ZOA_VIEW);
  });
});
