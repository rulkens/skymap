/**
 * filamentsLayer — focus-recession routing of the overlay opacity, pinned at both
 * ends of the blend on the 6th argument of `filamentRenderer.draw`.
 *
 * Also pins that the `enabled` gate is UNAFFECTED by recession: recession ∈
 * [FILAMENT_RECESSION, 1] can never zero a layer, so the gate must keep reading
 * the pure toggle alone.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { filamentsLayer } from '../../../../../src/services/engine/frame/passes/filamentsLayer';
import { COSMO, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { FILAMENT_RECESSION } from '../../../../../src/services/engine/presentation/focusRecession';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';

function makeCtx(focusBlend: number): ReadyFrameContext {
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
    renderedTargets: new Set<string>(),
    cam: {} as never,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    nowMs: 0,
    simDays: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: focusBlend,
    },
    galaxyPointRenderer: {} as never,
    renderTargets: {} as never,
    texturedDisks: {} as never,
  };
}

/**
 * Build a state whose filament fade reports `opacity` and whose
 * `settings.filaments` matches the supplied overrides.  `opacityOf` is a
 * single stub returning the same value regardless of handle/now — the
 * filaments layer only ever asks for the `{kind:'filament'}` handle, so a
 * constant stub faithfully models "the filament layer is at `opacity`".
 */
function makeState(
  opacity: number,
  filamentsOverrides: Partial<{ enabled: boolean; intensity: number }> = {},
  filamentRenderer: unknown = null,
): EngineState {
  return {
    subsystems: { fades: { opacityOf: () => opacity }, clipPlayer: { clipOpacityOf: () => 1 } },
    settings: {
      filaments: {
        enabled: true,
        intensity: 1,
        ...filamentsOverrides,
      },
    },
    gpu: { filamentRenderer },
  } as unknown as EngineState;
}

const PASS_STUB = {} as GPURenderPassEncoder;

describe('filamentsLayer.draw focus recession', () => {
  it('passes plain opacityOf at blend 0', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx(0);
    filamentsLayer.draw(
      PASS_STUB,
      slabViewOf(ctx, COSMO),
      ctx,
      makeState(1, {}, { draw: drawSpy }),
    );
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // Args: (pass, vp, viewport, halfwidth, intensity, opacity).
    expect(drawSpy.mock.calls[0]![5]).toBe(1);
  });

  it('passes opacityOf × FILAMENT_RECESSION at blend 1', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx(1);
    filamentsLayer.draw(
      PASS_STUB,
      slabViewOf(ctx, COSMO),
      ctx,
      makeState(1, {}, { draw: drawSpy }),
    );
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]![5]).toBeCloseTo(FILAMENT_RECESSION, 6);
  });
});

describe('filamentsLayer.enabled is unaffected by focus recession', () => {
  it('returns false when the toggle is off and opacity is 0, regardless of blend', () => {
    // Pass enabled=false via state; settings arg is unused by the layer.
    const state = makeState(0, { enabled: false });
    expect(filamentsLayer.enabled(state, makeCtx(0))).toBe(false);
    expect(filamentsLayer.enabled(state, makeCtx(1))).toBe(false);
  });
});

describe('filamentsLayer.draw renderer-null guard', () => {
  it('skips drawing when state.gpu.filamentRenderer is null even if enabled', () => {
    const state = makeState(1, { enabled: true }, null);
    const ctx = makeCtx(0);
    expect(() => filamentsLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state)).not.toThrow();
  });
});
