/**
 * foregroundLabelsPass — now a thin draw-call shim over what
 * `foregroundLabelDirector` already uploaded earlier in `runFrame` (spec §5.2).
 *
 * `enabled` must read the director's `labels()` fresh every call — the "latches
 * false forever" regression is now impossible by construction, since the
 * upload happens outside this layer's own `draw` (in the director), so there
 * is no same-frame ordering for a stale artifact to hide behind.
 */

import { describe, it, expect, vi } from 'vitest';

import { foregroundLabelsPass } from '../../../../../src/services/engine/frame/passes/foregroundLabelsPass';
import { NEAR0_OVERLAY_CLIP_SCALE } from '../../../../../src/services/engine/frame/near0OverlayClipScale';
import { near0LabelProjection } from '../../../../../src/services/engine/frame/near0LabelProjection';
import { createLabel2DDirector } from '../../../../../src/services/engine/subsystems/label2DDirector';
import { FOREGROUND_LABEL_DIRECTOR } from '../../../../../src/data/labels/foregroundLabelDirectorConfig';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { Label2DDirector } from '../../../../../src/@types/engine/subsystems/Label2DDirector';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';
import type { Label2DProducer } from '../../../../../src/@types/engine/subsystems/Label2DProducer';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

// `draw` reads its `view` argument for ONE thing — the sampled depth the
// occlusion joint binds. The projection comes from `near0LabelProjection(ctx)`
// instead (the shared lookup the director itself uses), so the stub carries
// nothing else. A null row leaves the frame unresolved, which is what pins the
// far-placeholder pairing below.
const VIEW_STUB = {
  sampledDepth: { view: {} as GPUTextureView, row: null },
} as unknown as SlabView;

// `ctx.renderTargets`' two views, distinct objects so the pairing is provable.
const COLOR_VIEW = {} as GPUTextureView;
const FAR_DEPTH_VIEW = {} as GPUTextureView;

// What both renderers must receive as their occlusion joint.
const SCENE_STUB = { colorView: COLOR_VIEW, depthView: FAR_DEPTH_VIEW, frame: null };

function makeRenderer(): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label2D[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    destroy: vi.fn(),
  } as unknown as LabelRenderer;
}

function makeLineRenderer(): MarkerLineRenderer {
  return {
    label: 'foregroundMarkerLineRenderer',
    setLines: vi.fn<() => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    lineCount: () => 0,
    destroy: vi.fn(),
  } as unknown as MarkerLineRenderer;
}

function makeState(
  renderer: LabelRenderer | null,
  lineRenderer: MarkerLineRenderer | null = makeLineRenderer(),
  director: Pick<Label2DDirector, 'labels'> = { labels: () => [] },
): EngineState {
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
    subsystems: { foregroundLabelDirector: director },
  } as unknown as EngineState;
}

// A real NEAR0 slab (not mocked) — `near0LabelProjection` runs the genuine
// `rebaseViewProj` + `narrowMat4` chain against it, matching what the director
// resolves for the same `ctx` this frame. `nowMs` defaults to 0 for the draw
// tests (which don't animate); the gate test below steps it explicitly, and
// builds a FRESH ctx object per frame — `near0LabelProjection` memoises per
// ctx identity, matching how `runFrame` mints a new ctx every frame for real.
function makeCtx(nowMs = 0): FrameView {
  const slab: Slab = makeSlab();
  return {
    snapshot: {
      nowMs,
      renderTargets: { viewOf: () => COLOR_VIEW, farDepthView: () => FAR_DEPTH_VIEW },
      renderedTargets: new Set(['foreground:0']),
    },
    slabs: [slab],
    drawCamPos: [2, 3, 5],
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

describe('foregroundLabelsPass.enabled', () => {
  it("tracks the director's last flush across the runFrame/draw seam, and re-opens when demand returns", () => {
    // The "latches false forever" regression, exercised across the REAL seam:
    // a REAL `label2DDirector` flushes via `runFrame` BEFORE the frame
    // program walks, and `enabled` reads the director's `labels()` — so this
    // test fails if the gate ever stops following the director's last flush.
    // `enabled` itself never calls `draw`.
    const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
    const labelRenderer = makeRenderer();
    const lineRenderer = makeLineRenderer();
    dir.attachRenderers(labelRenderer, lineRenderer, () => null);

    // A producer that ALWAYS emits one candidate — real producers never omit
    // a row, they drive it to invisible via `fadeAlpha` (Task 4/5's
    // contract) — so demand toggles via `fadeAlpha`, exercising the
    // envelope's ease exactly like a real distance-band caption would.
    let fadeAlpha = 1;
    const producer: Label2DProducer = {
      id: 'demand-probe',
      produceLabels: () => ({
        labels: [
          {
            id: 'probe',
            worldPos: [0, 0, 0],
            text: 'x',
            font: 'cormorant',
            pixelSize: 10,
            fadeAlpha,
          },
        ],
        awake: false,
      }),
    };
    dir.registerProducer(producer);
    const state = {
      subsystems: {},
      selection: { hover: null, select: null },
      selectionKindRows: [],
    } as unknown as EngineState;
    const layerState = makeState(labelRenderer, lineRenderer, dir);

    // Demand present: a brand-new id seeds AT its target — no ramp needed —
    // so the very first flush already carries it.
    dir.runFrame(state, makeCtx(0));
    expect(foregroundLabelsPass.enabled(layerState, makeCtx(0), VIEW_STUB)).toBe(true);

    // Demand drops (fadeAlpha → 0): a short dt later the envelope has only
    // PARTLY eased down — still emitted, so the gate stays open through the
    // fade-out tail exactly like the deleted layer-level demand-drop test.
    fadeAlpha = 0;
    dir.runFrame(state, makeCtx(50));
    expect(foregroundLabelsPass.enabled(layerState, makeCtx(50), VIEW_STUB)).toBe(true);

    // Far enough later the envelope settles exactly on 0 — the label drops
    // from the flush and the gate finally closes.
    dir.runFrame(state, makeCtx(5050));
    expect(foregroundLabelsPass.enabled(layerState, makeCtx(5050), VIEW_STUB)).toBe(false);

    // Demand returns: the very next flush carries the label again (mid-ease
    // back toward 1, still nonzero), and the gate re-opens immediately —
    // the "latches false forever" bug this whole test exists to catch.
    fadeAlpha = 1;
    dir.runFrame(state, makeCtx(5100));
    expect(foregroundLabelsPass.enabled(layerState, makeCtx(5100), VIEW_STUB)).toBe(true);
  });
});

describe('foregroundLabelsPass.draw', () => {
  it('resolves the shared NEAR0 projection (near0LabelProjection(ctx)) and draws the labels through it', () => {
    const renderer = makeRenderer();
    const state = makeState(renderer, null);
    const ctx = makeCtx();

    foregroundLabelsPass.draw(PASS_STUB, VIEW_STUB, ctx, state);

    // Memoised per ctx — calling it again here returns the SAME object the
    // layer consumed, so identity proves the layer used the shared lookup
    // rather than re-deriving its own vp.
    const projection = near0LabelProjection(ctx);
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]).toEqual([
      PASS_STUB,
      projection.vpF32,
      projection.viewportPx,
      projection.pxPerRad,
      { scene: SCENE_STUB, clipScale: NEAR0_OVERLAY_CLIP_SCALE },
    ]);
  });

  it('draws the leader-line renderer through the same shared projection, before the labels', () => {
    const renderer = makeRenderer();
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);
    const ctx = makeCtx();
    const order: string[] = [];
    (lineRenderer.draw as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      order.push('line'),
    );
    (renderer.draw as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      order.push('label'),
    );

    foregroundLabelsPass.draw(PASS_STUB, VIEW_STUB, ctx, state);

    const projection = near0LabelProjection(ctx);
    const lineDrawSpy = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(lineDrawSpy).toHaveBeenCalledTimes(1);
    expect(lineDrawSpy.mock.calls[0]).toEqual([
      PASS_STUB,
      projection.vpF32,
      projection.viewportPx,
      projection.pxPerRad,
      SCENE_STUB,
    ]);
    expect(order).toEqual(['line', 'label']);
  });

  it('draws captions even when the leader-line renderer is null (bootstrap gap)', () => {
    const renderer = makeRenderer();
    const state = makeState(renderer, null);
    foregroundLabelsPass.draw(PASS_STUB, VIEW_STUB, makeCtx(), state);
    expect(renderer.draw as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});
