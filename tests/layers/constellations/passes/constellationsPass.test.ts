/**
 * constellationsPass — the hard distance cull ("opacity 0 ⇒ no render") must
 * win over the settings toggle, and the draw call is gated on
 * `runtime.renderer.hasData()` — the slot commit's job, never this pass's.
 */

import { describe, it, expect, vi } from 'vitest';
import { constellationsPass } from '../../../../src/layers/constellations/passes/constellationsPass';
import { NEAR0, slabViewOf } from '../../../../src/services/engine/frame/slabs';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { ConstellationsRuntime } from '../../../../src/layers/constellations/@types/ConstellationsRuntime';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

function makeCtx(camPos: readonly [number, number, number]): FrameView {
  const near0Slab: Slab = makeSlab();
  return {
    viewSlot: 0,
    bodyPose: () => null,
    vp: new Float32Array(16),
    slabs: [near0Slab, near0Slab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: camPos,
    drawPxPerRad: 720,
    fovYRad: (60 * Math.PI) / 180,
    snapshot: {
      nowMs: 0,
      simDays: 0,
      focusBlend: 0,
      visibleSourceMask: 0xffffffff,
      cursorTexPx: null,
      renderedTargets: new Set<string>(),
      focus: {
        center: [0, 0, 0] as Readonly<[number, number, number]>,
        apparentRadiusMpc: 1,
        physicalRadiusMpc: 0,
        blend: 0,
      },
      renderTargets: {} as never,
    },
  } as unknown as FrameView;
}

function makeState(enabled: boolean, fadeOpacity = 0): EngineState {
  return {
    settings: { constellations: { enabled, intensity: 1 } },
    subsystems: { fades: { opacityOf: () => fadeOpacity }, clipPlayer: { clipOpacityOf: () => 1 } },
  } as unknown as EngineState;
}

function makeRuntime(
  hasData: boolean,
  draw: (...args: unknown[]) => void = vi.fn(),
): ConstellationsRuntime {
  return { renderer: { hasData: () => hasData, draw } } as unknown as ConstellationsRuntime;
}

const PASS_STUB = {} as GPURenderPassEncoder;

describe('constellationsPass enabled', () => {
  it('the hard distance cull disables the row even while the toggle is on', () => {
    // Past `goneAt`, the band alone is 0, and `enabled` never reaches the
    // toggle/fade-opacity branch below it.
    const farCamPos: readonly [number, number, number] = [
      SCALE_FADE_BANDS.constellations.goneAt * 10,
      0,
      0,
    ];
    const ctx = makeCtx(farCamPos);
    const pass = constellationsPass(makeRuntime(true));
    expect(pass.enabled(makeState(true), ctx, slabViewOf(ctx, NEAR0))).toBe(false);
  });

  it('inside the band, the toggle governs (on → true, off with zero fade → false)', () => {
    const nearCamPos: readonly [number, number, number] = [0, 0, 0];
    const ctx = makeCtx(nearCamPos);
    const pass = constellationsPass(makeRuntime(true));
    expect(pass.enabled(makeState(true), ctx, slabViewOf(ctx, NEAR0))).toBe(true);
    expect(pass.enabled(makeState(false, 0), ctx, slabViewOf(ctx, NEAR0))).toBe(false);
    // Fade-out tail: toggle off but opacity still > 0 keeps drawing.
    expect(pass.enabled(makeState(false, 0.4), ctx, slabViewOf(ctx, NEAR0))).toBe(true);
  });
});

describe('constellationsPass draw', () => {
  it('skips the draw call when the renderer holds no data', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx([0, 0, 0]);
    constellationsPass(makeRuntime(false, drawSpy)).draw(
      PASS_STUB,
      slabViewOf(ctx, NEAR0),
      ctx,
      makeState(true),
    );
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it('draws once the renderer has data', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx([0, 0, 0]);
    constellationsPass(makeRuntime(true, drawSpy)).draw(
      PASS_STUB,
      slabViewOf(ctx, NEAR0),
      ctx,
      makeState(true),
    );
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });
});
