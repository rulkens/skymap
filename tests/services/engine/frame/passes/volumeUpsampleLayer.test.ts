/**
 * volumeUpsampleLayer tests — gate predicate (five enabled() cases) and
 * draw behaviour (the call to volumeUpsample.draw + the defensive null-
 * guard).
 *
 * These tests deliberately do not stand up a real GPUDevice — all
 * GPU-typed values are cast stubs.  The split between `enabled` and
 * `draw` (from the `ContentLayer` interface) lets us assert the gate
 * predicate independently from the actual draw commands, which is the
 * main reason the interface exists.  See `ContentLayer.d.ts` for the
 * rationale.
 *
 * `draw`'s second argument is a `SlabView`, but `volumeUpsampleLayer`
 * doesn't read it — the upsample is a screen-space blit of an
 * already-rendered offscreen target, not a re-projected draw — so the
 * fixture below is an opaque placeholder.
 *
 * The implementation reads `ctx.renderTargets.viewOf('volume')` — the
 * half-res row of the offscreen target table — and the draw assertion
 * checks `drawSpy.mock.calls[0]![1]` equals that view.
 */
import { describe, it, expect, vi } from 'vitest';
import { volumeUpsampleLayer } from '../../../../../src/services/engine/frame/passes/volumeUpsampleLayer';
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
    id: 'volume',
    format: 'rgba16float' as const,
    depth: null,
    scale: 3,
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
  },
];

/**
 * Build a minimal ReadyFrameContext.  The `offscreenView` parameter
 * becomes the target table's 'volume' row view — the same value the layer
 * reads when calling `volumeUpsample.draw(pass, ctx.renderTargets.viewOf('volume'))`.
 */
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
      viewOf: (id: string) => (id === 'volume' ? offscreenView : ({} as GPUTextureView)),
      // No row in this fixture declares depth, and the upsample layer never
      // asks for a depth view — throwing mirrors the real table's behaviour
      // for depthless rows.
      depthViewOf: (id: string): GPUTextureView => {
        throw new Error(`fixture renderTargets: no depth view for '${id}'`);
      },
      resize: vi.fn(),
      setSwapFormat: vi.fn(),
      destroy: vi.fn(),
    },
    texturedDisks: {} as never,
  };
}

// `volumeUpsampleLayer.draw` never reads `view` — an opaque placeholder
// documents that this layer is the one HDR content layer with no
// SlabView-dependent behaviour.
const VIEW_STUB = {} as SlabView;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// ---------------------------------------------------------------------------
// enabled()
// ---------------------------------------------------------------------------

// `enabled` now delegates entirely to `deriveVolumeLiveness` — the shared
// projection the half-res raymarch layer also gates on, so producer and
// consumer of the volume target can't disagree. The exhaustive gate-axis
// coverage lives in `volumeLiveness.test.ts`; these cases pin that this layer
// tracks it, and — crucially — that a null `volumeUpsample` NO LONGER gates
// `enabled` (it's a `draw`-only defensive concern now, since both handles are
// minted together in initGpu).
function livenessState(init: {
  renderer?: unknown;
  volumesEnabled?: boolean;
  masterOpacity?: number;
  hasActiveFields?: () => boolean;
  volumeUpsample?: unknown;
}): EngineState {
  const renderer =
    init.renderer === undefined
      ? { hasActiveFields: init.hasActiveFields ?? (() => true), listIds: () => [] }
      : init.renderer;
  return {
    gpu: {
      volumeFieldRenderer: renderer,
      volumeUpsample: init.volumeUpsample ?? { draw: vi.fn(), destroy: vi.fn() },
    },
    subsystems: { fades: { opacityOf: () => init.masterOpacity ?? 1 } },
    settings: { volumes: { enabled: init.volumesEnabled ?? true, items: {} } },
  } as unknown as EngineState;
}

describe('volumeUpsampleLayer.enabled', () => {
  it('returns false when volumes.enabled is false and master fade is fully out', () => {
    expect(
      volumeUpsampleLayer.enabled(
        livenessState({ volumesEnabled: false, masterOpacity: 0 }),
        makeCtx(),
      ),
    ).toBe(false);
  });

  it('returns false when no fields are active and no fade-out tail is in flight', () => {
    expect(
      volumeUpsampleLayer.enabled(livenessState({ hasActiveFields: () => false }), makeCtx()),
    ).toBe(false);
  });

  it('returns false when volumeFieldRenderer is null (pre-bootstrap)', () => {
    expect(volumeUpsampleLayer.enabled(livenessState({ renderer: null }), makeCtx())).toBe(false);
  });

  it('stays enabled even when volumeUpsample is null (draw self-guards, not the gate)', () => {
    // The producer (scalar-volume raymarch) and this consumer share one gate;
    // volumeUpsample being null is a bootstrap-only case handled defensively in
    // draw, so it must NOT desync the two by hiding only this layer.
    expect(volumeUpsampleLayer.enabled(livenessState({ volumeUpsample: null }), makeCtx())).toBe(
      true,
    );
  });

  it('returns true when the shared liveness is non-null', () => {
    expect(volumeUpsampleLayer.enabled(livenessState({}), makeCtx())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// draw()
// ---------------------------------------------------------------------------

describe('volumeUpsampleLayer.draw', () => {
  it("calls volumeUpsample.draw with the HDR pass and the target table's volume view", () => {
    const offscreenView = {} as GPUTextureView;
    const drawSpy = vi.fn();
    const state = {
      gpu: {
        volumeFieldRenderer: { hasActiveFields: () => true },
        volumeUpsample: { draw: drawSpy, destroy: vi.fn() },
      },
    } as unknown as EngineState;
    volumeUpsampleLayer.draw(PASS_STUB, VIEW_STUB, makeCtx(offscreenView), state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect((drawSpy as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(PASS_STUB);
    expect((drawSpy as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(offscreenView);
  });

  it('does not throw when volumeUpsample is null (defensive null-check)', () => {
    const state = {
      gpu: {
        volumeFieldRenderer: { hasActiveFields: () => true },
        volumeUpsample: null,
      },
    } as unknown as EngineState;
    expect(() => volumeUpsampleLayer.draw(PASS_STUB, VIEW_STUB, makeCtx(), state)).not.toThrow();
  });
});
