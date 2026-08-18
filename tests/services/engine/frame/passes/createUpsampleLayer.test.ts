/**
 * createUpsampleLayer tests — the shared factory the four HDR upsample
 * ContentLayers (volume, star-aggregate, milky-way, zone-of-avoidance) will
 * collapse onto. `enabled`/`name`/`slab` are forwarded verbatim from the row
 * (untested here — trivial passthrough); these tests cover `draw`'s two
 * independent halves: the blit (guarded by the row's handle) and `postBlit`
 * (guarded by nothing the factory adds — see finding 7 in the brief).
 */
import { describe, it, expect, vi } from 'vitest';
import { createUpsampleLayer } from '../../../../../src/services/engine/frame/passes/createUpsampleLayer';
import type { UpsampleLayerRow } from '../../../../../src/@types/engine/frame/UpsampleLayerRow';
import type { Upsample } from '../../../../../src/@types/rendering/Upsample';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Mat4 } from 'wgpu-matrix';

const FIXTURE_SPECS = [
  {
    id: 'hdr',
    format: 'rgba16float' as const,
    depth: null,
    scale: 1,
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
  },
  {
    id: 'test-target',
    format: 'rgba16float' as const,
    depth: null,
    scale: 3,
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
  },
];

/** Minimal ReadyFrameContext whose 'test-target' row resolves to `offscreenView`. */
function makeCtx(offscreenView: GPUTextureView = {} as GPUTextureView): ReadyFrameContext {
  return {
    isReady: true,
    renderedTargets: new Set<string>(),
    cam: {} as never,
    vp: new Float32Array(16) as unknown as Mat4,
    slabs: [],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    nowMs: 0,
    simDays: 0,
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
      specs: FIXTURE_SPECS,
      specOf: (id: string) => {
        const spec = FIXTURE_SPECS.find((s) => s.id === id);
        if (!spec) throw new Error(`fixture renderTargets: no spec row for '${id}'`);
        return spec;
      },
      sizeOf: vi.fn(),
      viewOf: (id: string) => (id === 'test-target' ? offscreenView : ({} as GPUTextureView)),
      depthViewOf: (id: string): GPUTextureView => {
        throw new Error(`fixture renderTargets: no depth view for '${id}'`);
      },
      reconcile: vi.fn(),
      setSwapFormat: vi.fn(),
      destroy: vi.fn(),
    },
    texturedDisks: {} as never,
  };
}

const VIEW_STUB = {} as SlabView;
const STATE_STUB = {} as EngineState;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

function makeRow(overrides: Partial<UpsampleLayerRow> = {}): UpsampleLayerRow {
  return {
    name: 'test-upsample',
    slab: 0,
    sourceTargetId: 'test-target',
    handleOf: () => null,
    enabled: () => true,
    ...overrides,
  };
}

describe('createUpsampleLayer', () => {
  it("blits the source target's view through the row's handle", () => {
    const offscreenView = {} as GPUTextureView;
    const drawSpy = vi.fn();
    const handle: Upsample = { draw: drawSpy };
    const layer = createUpsampleLayer(makeRow({ handleOf: () => handle }));

    layer.draw(PASS_STUB, VIEW_STUB, makeCtx(offscreenView), STATE_STUB);

    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect((drawSpy as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(PASS_STUB);
    expect((drawSpy as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(offscreenView);
  });

  it('skips the blit when the handle is null', () => {
    const layer = createUpsampleLayer(makeRow({ handleOf: () => null }));

    expect(() => layer.draw(PASS_STUB, VIEW_STUB, makeCtx(), STATE_STUB)).not.toThrow();
  });

  it('runs postBlit after the blit, into the same pass', () => {
    const order: string[] = [];
    const seenPasses: GPURenderPassEncoder[] = [];
    const handle: Upsample = {
      draw: (pass) => {
        order.push('blit');
        seenPasses.push(pass);
      },
    };
    const postBlit = vi.fn((pass: GPURenderPassEncoder) => {
      order.push('postBlit');
      seenPasses.push(pass);
    });
    const layer = createUpsampleLayer(makeRow({ handleOf: () => handle, postBlit }));

    layer.draw(PASS_STUB, VIEW_STUB, makeCtx(), STATE_STUB);

    expect(order).toEqual(['blit', 'postBlit']);
    expect(seenPasses).toEqual([PASS_STUB, PASS_STUB]);
  });

  it('still runs postBlit when the blit handle is null', () => {
    const postBlit = vi.fn();
    const layer = createUpsampleLayer(makeRow({ handleOf: () => null, postBlit }));

    layer.draw(PASS_STUB, VIEW_STUB, makeCtx(), STATE_STUB);

    expect(postBlit).toHaveBeenCalledTimes(1);
    expect((postBlit as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(PASS_STUB);
  });
});
