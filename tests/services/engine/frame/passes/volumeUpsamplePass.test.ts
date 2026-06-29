/**
 * volumeUpsamplePass tests — gate predicate (five enabled() cases) and
 * draw behaviour (the call to volumeUpsample.draw + the defensive null-
 * guard).
 *
 * These tests deliberately do not stand up a real GPUDevice — all
 * GPU-typed values are cast stubs.  The split between `enabled` and
 * `draw` (from the `Pass` interface) lets us assert the gate predicate
 * independently from the actual draw commands, which is the main reason
 * the interface exists.  See `Pass.d.ts` for the rationale.
 *
 * Two things that differ from the plan's code snippet (lines ~1211-1228
 * in the plan file):
 *
 *   1. The plan's `makeCtx` puts `halfResView` on `postProcess` — that
 *      was the pre-refactor shape.  The current `ReadyFrameContext` has a
 *      `volumeOffscreen: VolumeOffscreen` field at the top level; the
 *      implementation reads `ctx.volumeOffscreen.view`.  Our fixture
 *      reflects the live shape.
 *
 *   2. The draw assertion checks `drawSpy.mock.calls[0]![1]` equals
 *      `offscreenView` (the view on `ctx.volumeOffscreen`) — not anything
 *      on `postProcess`.
 */
import { describe, it, expect, vi } from 'vitest';
import { volumeUpsamplePass } from '../../../../../src/services/engine/frame/passes/volumeUpsamplePass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { Mat4 } from 'wgpu-matrix';

/**
 * Build a minimal ReadyFrameContext.  The `offscreenView` parameter
 * becomes `ctx.volumeOffscreen.view` — the same value the pass reads when
 * calling `volumeUpsample.draw(pass, ctx.volumeOffscreen.view)`.
 */
function makeCtx(offscreenView: GPUTextureView = {} as GPUTextureView): ReadyFrameContext {
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as Mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    renderer: {} as never,
    postProcess: {
      view: {} as GPUTextureView,
      resize: vi.fn(),
      draw: vi.fn(),
      destroy: vi.fn(),
    } as never,
    volumeOffscreen: { view: offscreenView, resize: vi.fn(), destroy: vi.fn() },
    texturedDisks: {} as never,
    foregroundVp: new Float64Array(16),
    foregroundNear: 0.001,
    foregroundFar: 1000,
    renderOrigin: [0, 0, 0],
  };
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const DEPS_STUB = {} as PassDeps;

// ---------------------------------------------------------------------------
// enabled()
// ---------------------------------------------------------------------------

describe('volumeUpsamplePass.enabled', () => {
  it('returns false when volumes.enabled is false and master fade is fully out', () => {
    const state = {
      gpu: {
        volumeFieldRenderer: { hasActiveFields: () => true, listIds: () => [] },
        volumeUpsample: { draw: vi.fn(), destroy: vi.fn() },
      },
      // Master opacity 0 = no fade-out tail in flight. The gate
      // short-circuits to false when both gates miss.
      subsystems: { fades: { opacityOf: () => 0 } },
      settings: { volumes: { enabled: false } },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx())).toBe(false);
  });

  it('returns false when no fields are active and no fade-out tail is in flight', () => {
    const state = {
      gpu: {
        volumeFieldRenderer: {
          hasActiveFields: () => false,
          // The fade-tail check iterates listIds and calls
          // fades.opacityOf for each. Empty list → no tails → gate
          // stays false.
          listIds: () => [],
        },
        volumeUpsample: { draw: vi.fn(), destroy: vi.fn() },
      },
      subsystems: { fades: { opacityOf: () => 0 } },
      settings: { volumes: { enabled: true } },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx())).toBe(false);
  });

  it('returns false when volumeUpsample is null (pre-bootstrap)', () => {
    const state = {
      gpu: {
        volumeFieldRenderer: { hasActiveFields: () => true },
        volumeUpsample: null,
      },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx())).toBe(false);
  });

  it('returns false when volumeFieldRenderer is null (pre-bootstrap)', () => {
    const state = {
      gpu: {
        volumeFieldRenderer: null,
        volumeUpsample: { draw: vi.fn(), destroy: vi.fn() },
      },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx())).toBe(false);
  });

  it('returns true when every gate passes', () => {
    const state = {
      gpu: {
        volumeFieldRenderer: { hasActiveFields: () => true, listIds: () => [] },
        volumeUpsample: { draw: vi.fn(), destroy: vi.fn() },
      },
      subsystems: { fades: { opacityOf: () => 1 } },
      settings: { volumes: { enabled: true } },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// draw()
// ---------------------------------------------------------------------------

describe('volumeUpsamplePass.draw', () => {
  it('calls volumeUpsample.draw with the HDR pass and ctx.volumeOffscreen.view', () => {
    const offscreenView = {} as GPUTextureView;
    const drawSpy = vi.fn();
    const state = {
      gpu: {
        volumeFieldRenderer: { hasActiveFields: () => true },
        volumeUpsample: { draw: drawSpy, destroy: vi.fn() },
      },
    } as unknown as EngineState;
    volumeUpsamplePass.draw(PASS_STUB, makeCtx(offscreenView), state, DEPS_STUB);
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
    expect(() => volumeUpsamplePass.draw(PASS_STUB, makeCtx(), state, DEPS_STUB)).not.toThrow();
  });
});
