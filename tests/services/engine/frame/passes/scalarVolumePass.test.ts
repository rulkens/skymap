/**
 * scalarVolumePass tests — the half-resolution scalar-volume raymarch as a
 * ContentPass (`target: 'volume'`, `slab: COSMO`, `blend: 'additive'`).
 *
 * The executor owns the pass + the (0,0,0,0) clear (verified in
 * executeFrame.test.ts); this layer only draws. These tests pin the
 * draw-arg + gate contract: the downsampled viewport threaded to
 * `volumeFieldRenderer.draw`, the per-field closures forwarded by identity,
 * and the `enabled` gate tracking `deriveVolumeLiveness`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { scalarVolumePass } from '../../../../../src/services/engine/frame/passes/scalarVolumePass';
import { COSMO, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { makeCosmoSlab } from '../../../../fixtures/makeCosmoSlab';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

// The layer reads its viewport via `sizeOf('volume')` — the fixture computes
// it here, mirroring the production table's scale: 3.
const VOLUME_SCALE = 3;

function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const vp = new Float32Array(16) as unknown as Mat4;
  const canvasSize = over.canvasSize ?? { width: 1280, height: 720 };
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  return {
    isReady: true,
    cam: {} as never,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize,
    drawCamPos: [1, 2, 3] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    nowMs: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    galaxyPointRenderer: {} as never,
    renderTargets: {
      specs: [
        { id: 'hdr', format: 'rgba16float', depth: null, scale: 1 },
        { id: 'volume', format: 'rgba16float', depth: null, scale: VOLUME_SCALE },
      ],
      sizeOf: (id: string) => {
        if (id !== 'volume') throw new Error(`fixture renderTargets: no size for '${id}'`);
        return {
          width: Math.max(1, Math.floor(canvasSize.width / VOLUME_SCALE)),
          height: Math.max(1, Math.floor(canvasSize.height / VOLUME_SCALE)),
        };
      },
      viewOf: () => ({}) as GPUTextureView,
      destroy: vi.fn(),
    } as never,
    texturedDisks: {} as never,
    ...over,
  } as unknown as ReadyFrameContext;
}

/** A live-volume state: renderer with active fields, master on. */
function liveState(
  over: { draw?: ReturnType<typeof vi.fn>; hasActiveFields?: () => boolean } = {},
) {
  return {
    gpu: {
      volumeFieldRenderer: {
        draw: over.draw ?? vi.fn(),
        hasActiveFields: over.hasActiveFields ?? (() => true),
        listIds: () => [],
      },
    },
    settings: { volumes: { enabled: true, items: {} } },
    subsystems: {
      fades: { opacityOf: () => 1 },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

describe('scalarVolumePass.enabled', () => {
  it('is enabled when deriveVolumeLiveness is non-null (renderer active, master on)', () => {
    const ctx = makeCtx();
    expect(scalarVolumePass.enabled(liveState(), ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });

  it('is disabled when no field is active', () => {
    const ctx = makeCtx();
    expect(
      scalarVolumePass.enabled(
        liveState({ hasActiveFields: () => false }),
        ctx,
        slabViewOf(ctx, COSMO),
      ),
    ).toBe(false);
  });
});

describe('scalarVolumePass.draw', () => {
  it('draws with the SlabView vp/camPos and the downsampled viewport', () => {
    const drawSpy = vi.fn();
    const state = liveState({ draw: drawSpy });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    scalarVolumePass.draw(PASS_STUB, view, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    // draw(pass, vp, viewportPx, camPos, settingsOf, fadeOpacityOf)
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(view.vp);
    // Downsampled viewport — matches the actual fragment count so the
    // raymarch's jitter dither frequency stays stable.
    expect(args[2]).toEqual([Math.floor(1280 / VOLUME_SCALE), Math.floor(720 / VOLUME_SCALE)]);
    expect(args[3]).toEqual(view.camPos);
  });
});
