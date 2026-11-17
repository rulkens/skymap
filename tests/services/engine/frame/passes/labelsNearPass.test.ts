/**
 * labelsNearPass — now a thin draw-call shim over what
 * `foregroundLabelDirector` already uploaded earlier in `runFrame` (spec §5.2).
 *
 * `enabled` must read the director's `labels()` fresh every call — the "latches
 * false forever" regression is now impossible by construction, since the
 * upload happens outside this layer's own `draw` (in the director), so there
 * is no same-frame ordering for a stale artifact to hide behind.
 */

import { describe, it, expect, vi } from 'vitest';

import { labelsNearPass } from '../../../../../src/services/engine/frame/passes/labelsNearPass';
import { createLabel2DDirector } from '../../../../../src/services/engine/subsystems/label2DDirector';
import { VIEW_RIGS } from '../../../../../src/data/rendering/viewRigs';
import { FOREGROUND_LABEL_DIRECTOR } from '../../../../../src/data/labels/foregroundLabelDirectorConfig';
import { makeSlab } from '../../../../fixtures/makeSlab';
import { identityLabelProjection } from '../../../../helpers/labels/identityLabelProjection';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { Label2DDirector } from '../../../../../src/@types/engine/subsystems/Label2DDirector';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';
import type { Label2DProjection } from '../../../../../src/@types/rendering/Label2DProjection';
import type { Label2DProducer } from '../../../../../src/@types/engine/subsystems/Label2DProducer';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

const SLAB: Slab = makeSlab();

// `draw` reads its `view` for the sampled depth the occlusion joint binds. The
// captions' projection comes from the director instead. A null row leaves the
// frame unresolved, which is what pins the far-placeholder pairing below.
const VIEW_STUB = {
  slab: SLAB,
  sampledDepth: { view: {} as GPUTextureView, row: null },
} as unknown as SlabView;

// What the director's `project` hands the pass; the caption draw passes it on.
const PROJECTION_STUB = { output: { sizePx: [1280, 720] } } as unknown as Label2DProjection;

// `ctx.renderTargets`' two views, distinct objects so the pairing is provable.
const COLOR_VIEW = {} as GPUTextureView;
const FAR_DEPTH_VIEW = {} as GPUTextureView;

// What the renderer must receive as its occlusion joint.
const SCENE_STUB = { colorView: COLOR_VIEW, depthView: FAR_DEPTH_VIEW, frame: null };

function makeRenderer(): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label2D[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    destroy: vi.fn(),
  } as unknown as LabelRenderer;
}

function makeState(
  renderer: LabelRenderer | null,
  director: Pick<Label2DDirector, 'labels' | 'project'> = {
    labels: () => [],
    project: () => PROJECTION_STUB,
  },
): EngineState {
  return {
    gpu: { labelRendererNear: renderer },
    subsystems: { foregroundLabelDirector: director, labelDirectors: [] },
  } as unknown as EngineState;
}

// `nowMs` defaults to 0 for the draw tests (which don't animate); the gate test
// below steps it explicitly, and builds a FRESH ctx object per frame, matching
// how `runFrame` mints a new ctx every frame for real.
function makeCtx(nowMs = 0): FrameView {
  return {
    snapshot: {
      nowMs,
      renderTargets: { viewOf: () => COLOR_VIEW, farDepthView: () => FAR_DEPTH_VIEW },
      renderedTargets: new Set(['foreground:0']),
    },
    slabs: [SLAB],
    drawCamPos: [2, 3, 5],
    canvasSize: { width: 1280, height: 720 },
    drawPxPerRad: 900,
  } as unknown as FrameView;
}

describe('labelsNearPass.enabled', () => {
  it("tracks the director's last flush across the runFrame/draw seam, and re-opens when demand returns", () => {
    // The "latches false forever" regression, exercised across the REAL seam:
    // a REAL `label2DDirector` flushes via `runFrame` BEFORE the frame
    // program walks, and `enabled` reads the director's `labels()` — so this
    // test fails if the gate ever stops following the director's last flush.
    // `enabled` itself never calls `draw`.
    // The gate is the subject, not the projection: an identity one keeps the ctx small.
    const dir = createLabel2DDirector(
      { ...FOREGROUND_LABEL_DIRECTOR, project: identityLabelProjection },
      VIEW_RIGS.mono,
    );
    const labelRenderer = makeRenderer();
    dir.attachRenderers(labelRenderer, () => null);

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
    const layerState = makeState(labelRenderer, dir);

    // Demand present: a brand-new id seeds AT its target — no ramp needed —
    // so the very first flush already carries it.
    dir.runFrame(state, makeCtx(0));
    expect(labelsNearPass.enabled(layerState, makeCtx(0), VIEW_STUB)).toBe(true);

    // Demand drops (fadeAlpha → 0): a short dt later the envelope has only
    // PARTLY eased down — still emitted, so the gate stays open through the
    // fade-out tail exactly like the deleted layer-level demand-drop test.
    fadeAlpha = 0;
    dir.runFrame(state, makeCtx(50));
    expect(labelsNearPass.enabled(layerState, makeCtx(50), VIEW_STUB)).toBe(true);

    // Far enough later the envelope settles exactly on 0 — the label drops
    // from the flush and the gate finally closes.
    dir.runFrame(state, makeCtx(5050));
    expect(labelsNearPass.enabled(layerState, makeCtx(5050), VIEW_STUB)).toBe(false);

    // Demand returns: the very next flush carries the label again (mid-ease
    // back toward 1, still nonzero), and the gate re-opens immediately —
    // the "latches false forever" bug this whole test exists to catch.
    fadeAlpha = 1;
    dir.runFrame(state, makeCtx(5100));
    expect(labelsNearPass.enabled(layerState, makeCtx(5100), VIEW_STUB)).toBe(true);
  });
});

describe('labelsNearPass.draw', () => {
  it("draws the labels through the director's projection, the one it decluttered with", () => {
    const renderer = makeRenderer();
    const state = makeState(renderer, {
      labels: () => [{} as Label2D],
      project: () => PROJECTION_STUB,
    });

    labelsNearPass.draw(PASS_STUB, VIEW_STUB, makeCtx(), state);

    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]![1]).toBe(PROJECTION_STUB);
    expect(drawSpy.mock.calls[0]).toEqual([PASS_STUB, PROJECTION_STUB, SCENE_STUB]);
  });
});
