/**
 * starAggregatesPass — the survey-star AGGREGATE stream into the half-res
 * offscreen. The cut is taken on the GPU; here we pin the pass's own choices:
 * the stream tag and the destination-sized viewport.
 */

import { describe, it, expect, vi } from 'vitest';

import { starAggregatesPass } from '../../../../src/layers/starCatalog/passes/starAggregatesPass';
import { Source } from '../../../../src/data/source';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalogCutDrawArgs } from '../../../../src/layers/starCatalog/@types/StarCatalogCutDrawArgs';
import type { StarCutInputs } from '../../../../src/layers/starCatalog/@types/StarCutInputs';

const PASS_STUB = {} as unknown as GPURenderPassEncoder;

// The pass reads its viewport via `sizeOf('star-aggregates')`; a capture draw's
// ctx IS the synthetic face camera whose `canvasSize` is the face, and `sizeOf`
// has no row for it — a pass reaching for the target there would throw.
function makeCtx(capture = false): FrameView {
  return {
    snapshot: {
      nowMs: 0,
      renderTargets: {
        sizeOf: (id: string) => {
          if (id === 'star-aggregates') return { width: 640, height: 360 };
          throw new Error(`fixture renderTargets: no size for '${id}'`);
        },
      },
    },
    drawCamPos: [0, 0, 0],
    drawPxPerRad: 600,
    viewSlot: capture ? 1 : 0,
    viewKind: capture ? 'capture' : 'frame',
    canvasSize: capture ? { width: 256, height: 256 } : { width: 1280, height: 720 },
  } as unknown as FrameView;
}

const FRAME: StarCutInputs = {
  cut: {
    originMpc: [0, 0, 0],
    planes: new Float32Array(24),
    refineThreshold: 0.05,
    worldSpread: 1,
    leafMarginRad: 0.001,
    sources: [{ source: Source.GaiaStars, opacity: 1, budgetTypical: 100 }],
  },
  nowMs: 0,
  sizePx: 2.5,
  brightness: 1,
  glowOverlap: 1,
  aggregateIntensityCap: 0.06,
};

function makeRuntime() {
  const drawCut = vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogCutDrawArgs) => void>();
  const renderer = { getFrameCut: () => FRAME, drawCut };
  return { runtime: { renderer } as unknown as StarCatalogRuntime, drawCut };
}

function makeNear0View(): SlabView {
  return { slab: makeSlab(), vp: new Float32Array(16), camPos: [0, 0, 0], viewportPx: [1280, 720] };
}

const STATE = {} as unknown as PassState;

describe('starAggregatesPass', () => {
  it('records the AGGREGATE stream, sized to the half-res offscreen without mutating the shared view', () => {
    const { runtime, drawCut } = makeRuntime();
    const view = makeNear0View();
    starAggregatesPass(runtime).draw!(PASS_STUB, view, makeCtx(), STATE);

    const args = drawCut.mock.calls[0]![1];
    expect(args.stream).toBe('aggregate');
    expect(args.viewportPx).toEqual([640, 360]);
    // Half the rows over the same frustum: half the pixels per radian.
    expect(args.pxPerRad).toBe(300);
    // One SlabView is shared by every layer in the render step.
    expect(view.viewportPx).toEqual([1280, 720]);
  });

  it('sizes against the capture face during a capture draw', () => {
    const { runtime, drawCut } = makeRuntime();
    starAggregatesPass(runtime).draw!(PASS_STUB, makeNear0View(), makeCtx(true), STATE);
    expect(drawCut.mock.calls[0]![1].viewportPx).toEqual([256, 256]);
    expect(drawCut.mock.calls[0]![1].pxPerRad).toBe(600);
  });
});
