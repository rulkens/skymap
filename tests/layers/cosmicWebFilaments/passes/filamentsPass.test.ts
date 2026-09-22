/**
 * filamentsPass — focus-recession routing of the overlay opacity, pinned at both
 * ends of the blend on the 6th argument of `filamentRenderer.draw`, plus the
 * SlabView threading and the either-or `enabled` gate: recession ∈
 * [FILAMENT_RECESSION, 1] can never zero a layer, so the gate must keep reading
 * the pure toggle alone, while a fade-out tail keeps drawing after it flips off.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { filamentsPass } from '../../../../src/layers/cosmicWebFilaments/passes/filamentsPass';
import { COSMO, slabViewOf } from '../../../../src/services/engine/frame/slabs';
import { FILAMENT_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FilamentsRuntime } from '../../../../src/layers/cosmicWebFilaments/@types/FilamentsRuntime';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

function makeCtx(focusBlend: number): FrameView {
  const vp = new Float32Array(16) as unknown as Mat4;
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  return {
    snapshot: {
      isReady: true,
      nowMs: 0,
      simDays: 0,
      focusBlend,
      visibleSourceMask: 0xffffffff,
      focus: {
        center: [0, 0, 0] as Readonly<[number, number, number]>,
        apparentRadiusMpc: 1,
        physicalRadiusMpc: 0,
        blend: focusBlend,
      },
      renderTargets: {} as never,
      cursorTexPx: null,
      renderedTargets: new Set<string>(),
    },
    viewSlot: 0,
    viewKind: 'frame',
    // Nothing in this file reads bodyPose.
    bodyPose: () => null,
    cam: {} as never,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
  } as unknown as FrameView;
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
  } as unknown as EngineState;
}

function makeRuntime(draw: (...args: unknown[]) => void): FilamentsRuntime {
  return { renderer: { draw }, slot: {} } as unknown as FilamentsRuntime;
}

const PASS_STUB = {} as GPURenderPassEncoder;

describe('filamentsPass draw focus recession', () => {
  it('passes plain opacityOf at blend 0', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx(0);
    filamentsPass(makeRuntime(drawSpy)).draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, makeState(1));
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // Args: (pass, vp, viewport, pxPerRad, halfwidth, intensity, opacity).
    expect(drawSpy.mock.calls[0]![6]).toBe(1);
  });

  it('passes opacityOf × FILAMENT_RECESSION at blend 1', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx(1);
    filamentsPass(makeRuntime(drawSpy)).draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, makeState(1));
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]![6]).toBeCloseTo(FILAMENT_RECESSION, 6);
  });

  it('threads the SlabView vp/viewport rather than ctx.vp/ctx.canvasSize', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx(0);
    const view = slabViewOf(ctx, COSMO);
    filamentsPass(makeRuntime(drawSpy)).draw(
      PASS_STUB,
      view,
      ctx,
      makeState(1, { intensity: 0.7 }),
    );
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(view.vp);
    expect(args[2]).toEqual(view.viewportPx);
    expect(args[3]).toBe(ctx.drawPxPerRad);
    expect(args[4]).toBe(1.5); // line halfwidth (FILAMENT_LINE_HALFWIDTH_PX)
    expect(args[5]).toBe(0.7);
  });
});

describe('filamentsPass enabled', () => {
  it('returns false when the toggle is off and opacity is 0, regardless of blend', () => {
    const state = makeState(0, { enabled: false });
    const ctx0 = makeCtx(0);
    const ctx1 = makeCtx(1);
    const pass = filamentsPass(makeRuntime(vi.fn()));
    expect(pass.enabled(state, ctx0, slabViewOf(ctx0, COSMO))).toBe(false);
    expect(pass.enabled(state, ctx1, slabViewOf(ctx1, COSMO))).toBe(false);
  });

  it('returns true when the toggle is off BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // The gate keeps the layer alive so the user sees the smooth ramp out
    // instead of an instant pop on the frame the toggle flips.
    const state = makeState(1, { enabled: false });
    const ctx = makeCtx(0);
    expect(filamentsPass(makeRuntime(vi.fn())).enabled(state, ctx, slabViewOf(ctx, COSMO))).toBe(
      true,
    );
  });
});
