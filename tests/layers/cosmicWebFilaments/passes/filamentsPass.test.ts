/**
 * filamentsPass — the handed value reaches `filamentRenderer.draw` as its opacity, and
 * the SlabView (not ctx.vp/ctx.canvasSize) is what the draw is threaded with.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { filamentsPass } from '../../../../src/layers/cosmicWebFilaments/passes/filamentsPass';
import { COSMO, slabViewOf } from '../../../../src/services/engine/frame/slabs';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import { STRONG_RECESSION } from '../../../../src/data/strongRecession';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CosmicWebFilamentsRuntime } from '../../../../src/layers/cosmicWebFilaments/@types/CosmicWebFilamentsRuntime';
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
      focusPickId: null,
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

function makeState(filamentsOverrides: Partial<{ intensity: number }> = {}): EngineState {
  return {
    settings: { cosmicWebFilaments: { enabled: true, intensity: 1, ...filamentsOverrides } },
  } as unknown as EngineState;
}

function makeRuntime(draw: (...args: unknown[]) => void): CosmicWebFilamentsRuntime {
  return { renderer: { draw }, slot: {} } as unknown as CosmicWebFilamentsRuntime;
}

const PASS_STUB = {} as GPURenderPassEncoder;

describe('filamentsPass draw', () => {
  it('draws at the handed value', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx(0);
    filamentsPass(makeRuntime(drawSpy)).draw(
      PASS_STUB,
      slabViewOf(ctx, COSMO),
      ctx,
      makeState(),
      0.4,
    );
    // Args: (pass, vp, viewport, pxPerRad, halfwidth, intensity, opacity).
    expect(drawSpy.mock.calls[0]![6]).toBe(0.4);
  });

  it('draws at the handed value times its recession', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx(1);
    filamentsPass(makeRuntime(drawSpy)).draw(
      PASS_STUB,
      slabViewOf(ctx, COSMO),
      ctx,
      makeState(),
      1,
    );
    expect(drawSpy.mock.calls[0]![6]).toBeCloseTo(STRONG_RECESSION);
  });

  it('threads the SlabView vp/viewport rather than ctx.vp/ctx.canvasSize', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx(0);
    const view = slabViewOf(ctx, COSMO);
    filamentsPass(makeRuntime(drawSpy)).draw(
      PASS_STUB,
      view,
      ctx,
      makeState({ intensity: 0.7 }),
      1,
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
