/**
 * foregroundLabelsLayer — now a thin draw-call shim over what
 * `foregroundLabelDirector` already uploaded earlier in `runFrame` (spec §5.2).
 *
 * `enabled` must read `renderer.glyphCount()` fresh every call — the "latches
 * false forever" regression is now impossible by construction, since the
 * upload happens outside this layer's own `draw` (in the director), so there
 * is no same-frame ordering for a stale artifact to hide behind.
 */

import { describe, it, expect, vi } from 'vitest';

import { foregroundLabelsLayer } from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { near0LabelProjection } from '../../../../../src/services/engine/frame/near0LabelProjection';
import { createLabel2DDirector } from '../../../../../src/services/engine/subsystems/label2DDirector';
import { FOREGROUND_LABEL_DIRECTOR } from '../../../../../src/services/engine/engine';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';
import type { Label2DProducer } from '../../../../../src/@types/engine/subsystems/Label2DProducer';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

// `draw` no longer reads its `view` argument — the projection comes from
// `near0LabelProjection(ctx)` instead (the shared lookup the director itself
// uses) — so every test hands it an otherwise-empty stub.
const VIEW_STUB = {} as unknown as SlabView;

function makeRenderer(glyphCount: number): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label2D[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    measure: vi.fn<() => null>(() => null),
    glyphCount: () => glyphCount,
    labelCount: () => 0,
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

// A REAL renderer contract for the gate test below: `glyphCount()` reflects
// whatever `setLabels` last received, exactly like the production renderer —
// a fixed-constant stub (as `makeRenderer` above hands out) would let the
// test pass even if the director's upload moved to AFTER this layer's draw.
function makeStatefulLabelRenderer(): LabelRenderer {
  let last: readonly Label2D[] = [];
  return {
    label: 'foregroundLabelRenderer',
    setLabels: (labels: readonly Label2D[]) => {
      last = labels;
    },
    draw: vi.fn<(...args: unknown[]) => void>(),
    measure: vi.fn<() => null>(() => null),
    glyphCount: () => last.reduce((n, l) => n + l.text.length, 0),
    labelCount: () => last.length,
    destroy: vi.fn(),
  } as unknown as LabelRenderer;
}

function makeState(
  renderer: LabelRenderer | null,
  lineRenderer: MarkerLineRenderer | null = makeLineRenderer(),
): EngineState {
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
  } as unknown as EngineState;
}

// A real NEAR0 slab (not mocked) — `near0LabelProjection` runs the genuine
// `rebaseViewProj` + `narrowMat4` chain against it, matching what the director
// resolves for the same `ctx` this frame. `nowMs` defaults to 0 for the draw
// tests (which don't animate); the gate test below steps it explicitly, and
// builds a FRESH ctx object per frame — `near0LabelProjection` memoises per
// ctx identity, matching how `runFrame` mints a new ctx every frame for real.
function makeCtx(nowMs = 0): ReadyFrameContext {
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5),
    originRelative: true,
    precision: 'f64',
    reversedZ: false,
  };
  return {
    slabs: [slab],
    drawCamPos: [2, 3, 5],
    canvasSize: { width: 1280, height: 720 },
    nowMs,
    renderTargets: { depthViewOf: () => ({}) as GPUTextureView },
    renderedTargets: new Set(['foreground:0']),
  } as unknown as ReadyFrameContext;
}

describe('foregroundLabelsLayer.enabled', () => {
  it("tracks the director's last flush across the runFrame/draw seam, and re-opens when demand returns", () => {
    // The "latches false forever" regression, exercised across the REAL seam:
    // a REAL `label2DDirector` uploads via `setLabels` (as `runFrame` does,
    // BEFORE the frame program walks), and a STATEFUL renderer's
    // `glyphCount()` reflects only what it last received — so this test
    // fails if a future change ever moved the director's upload to run
    // AFTER this layer's `draw`, or reintroduced a `draw`-local upload the
    // old layer used to do. `enabled` itself never calls `draw`.
    const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
    const labelRenderer = makeStatefulLabelRenderer();
    const lineRenderer = makeLineRenderer();
    dir.attachRenderers(labelRenderer, lineRenderer);

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
    const state = { subsystems: {} } as unknown as EngineState;
    const layerState = makeState(labelRenderer, lineRenderer);

    // Demand present: a brand-new id seeds AT its target — no ramp needed —
    // so the very first flush already carries it.
    dir.runFrame(state, makeCtx(0));
    expect(foregroundLabelsLayer.enabled(layerState, makeCtx(0))).toBe(true);

    // Demand drops (fadeAlpha → 0): a short dt later the envelope has only
    // PARTLY eased down — still emitted, so the gate stays open through the
    // fade-out tail exactly like the deleted layer-level demand-drop test.
    fadeAlpha = 0;
    dir.runFrame(state, makeCtx(50));
    expect(foregroundLabelsLayer.enabled(layerState, makeCtx(50))).toBe(true);

    // Far enough later the envelope settles exactly on 0 — the label drops
    // from the flush and the gate finally closes.
    dir.runFrame(state, makeCtx(5050));
    expect(foregroundLabelsLayer.enabled(layerState, makeCtx(5050))).toBe(false);

    // Demand returns: the very next flush carries the label again (mid-ease
    // back toward 1, still nonzero), and the gate re-opens immediately —
    // the "latches false forever" bug this whole test exists to catch.
    fadeAlpha = 1;
    dir.runFrame(state, makeCtx(5100));
    expect(foregroundLabelsLayer.enabled(layerState, makeCtx(5100))).toBe(true);
  });

  it('is false pre-bootstrap, before the renderer exists', () => {
    expect(foregroundLabelsLayer.enabled(makeState(null), makeCtx())).toBe(false);
  });
});

describe('foregroundLabelsLayer.draw', () => {
  it('resolves the shared NEAR0 projection (near0LabelProjection(ctx)) and draws the labels through it', () => {
    const renderer = makeRenderer(3);
    const state = makeState(renderer, null);
    const ctx = makeCtx();

    foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, ctx, state);

    // Memoised per ctx — calling it again here returns the SAME object the
    // layer consumed, so identity proves the layer used the shared lookup
    // rather than re-deriving its own vp.
    const projection = near0LabelProjection(ctx);
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]).toEqual([PASS_STUB, projection.vpF32, projection.viewportPx, {}]);
  });

  it('draws the leader-line renderer through the same shared projection, before the labels', () => {
    const renderer = makeRenderer(3);
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

    foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, ctx, state);

    const projection = near0LabelProjection(ctx);
    const lineDrawSpy = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(lineDrawSpy).toHaveBeenCalledTimes(1);
    expect(lineDrawSpy.mock.calls[0]).toEqual([
      PASS_STUB,
      projection.vpF32,
      projection.viewportPx,
      {},
    ]);
    expect(order).toEqual(['line', 'label']);
  });

  it('draws captions even when the leader-line renderer is null (bootstrap gap)', () => {
    const renderer = makeRenderer(3);
    const state = makeState(renderer, null);
    foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, makeCtx(), state);
    expect(renderer.draw as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the foreground renderer is null (pre-bootstrap)', () => {
    const state = makeState(null);
    expect(() => foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, makeCtx(), state)).not.toThrow();
  });
});
