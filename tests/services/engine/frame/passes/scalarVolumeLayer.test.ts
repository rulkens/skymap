/**
 * scalarVolumeLayer tests — the half-resolution scalar-volume raymarch as a
 * ContentLayer (`target: 'volume'`, `slab: COSMO`, `blend: 'additive'`).
 *
 * The executor owns the pass + the (0,0,0,0) clear (verified in
 * executeFrame.test.ts); this layer only draws. These tests pin the
 * draw-arg + gate contract: the downsampled viewport threaded to
 * `volumeFieldRenderer.draw`, the per-field closures forwarded by identity,
 * and the `enabled` gate tracking `deriveVolumeLiveness`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { scalarVolumeLayer } from '../../../../../src/services/engine/frame/passes/scalarVolumeLayer';
import { COSMO, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
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

// The layer reads the downsample divisor off the 'volume' spec row — the
// fixture mirrors the production table's scale: 3.
const VOLUME_SCALE = 3;

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
    cam: {} as never,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
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
      viewOf: () => ({}) as GPUTextureView,
      resize: vi.fn(),
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
    subsystems: { fades: { opacityOf: () => 1 } },
  } as unknown as EngineState;
}

describe('scalarVolumeLayer.enabled', () => {
  it('is enabled when deriveVolumeLiveness is non-null (renderer active, master on)', () => {
    expect(scalarVolumeLayer.enabled(liveState(), makeCtx())).toBe(true);
  });

  it('is disabled when the renderer is null (pre-bootstrap)', () => {
    const state = {
      gpu: { volumeFieldRenderer: null },
      settings: { volumes: { enabled: true, items: {} } },
      subsystems: { fades: { opacityOf: () => 1 } },
    } as unknown as EngineState;
    expect(scalarVolumeLayer.enabled(state, makeCtx())).toBe(false);
  });

  it('is disabled when no field is active', () => {
    expect(scalarVolumeLayer.enabled(liveState({ hasActiveFields: () => false }), makeCtx())).toBe(
      false,
    );
  });
});

describe('scalarVolumeLayer.draw', () => {
  it('draws with the SlabView vp/camPos and the downsampled viewport', () => {
    const drawSpy = vi.fn();
    const state = liveState({ draw: drawSpy });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    scalarVolumeLayer.draw(PASS_STUB, view, ctx, state);
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

  it('clamps the downsampled viewport to a minimum of 1 px', () => {
    const drawSpy = vi.fn();
    const state = liveState({ draw: drawSpy });
    const ctx = makeCtx({ canvasSize: { width: 1, height: 1 } });
    scalarVolumeLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state);
    expect(drawSpy.mock.calls[0]![2]).toEqual([1, 1]);
  });

  it('forwards the liveness settingsOf/fadeOpacityOf closures to draw', () => {
    // The renderer reads per-field knobs + fade opacity through the same
    // projection the gate was computed from; both reach draw (args 4 and 5).
    const drawSpy = vi.fn();
    const state = liveState({ draw: drawSpy });
    const ctx = makeCtx();
    scalarVolumeLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state);
    expect(typeof drawSpy.mock.calls[0]![4]).toBe('function');
    expect(typeof drawSpy.mock.calls[0]![5]).toBe('function');
  });

  it('is a no-op when volumes are not live (defensive — executor gates first)', () => {
    const drawSpy = vi.fn();
    const state = liveState({ draw: drawSpy, hasActiveFields: () => false });
    const ctx = makeCtx();
    scalarVolumeLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state);
    expect(drawSpy).not.toHaveBeenCalled();
  });
});
