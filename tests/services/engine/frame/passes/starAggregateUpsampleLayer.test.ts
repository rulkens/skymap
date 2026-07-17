/**
 * starAggregateUpsampleLayer — the HDR composite that reads the half-res
 * `star-aggregates` offscreen and adds the knee'd result into HDR. Mirrors
 * `volumeUpsampleLayer.test.ts`: the gate delegates to `starCatalogVisible`
 * (shared with the aggregate producer, so no stale-offscreen composite), and
 * `draw` calls `starAggregateUpsample.draw` with the HDR pass + the
 * 'star-aggregates' offscreen view, defended by a null-check.
 */

import { describe, it, expect, vi } from 'vitest';

import { starAggregateUpsampleLayer } from '../../../../../src/services/engine/frame/passes/starAggregateUpsampleLayer';
import { starCatalogLayer } from '../../../../../src/services/engine/frame/passes/starCatalogLayer';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../src/data/sources/gaia-stars';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;
const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;

const VIEW_STUB = {} as SlabView;
const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

/** ctx whose 'star-aggregates' offscreen view is a captured sentinel. */
function makeCtx(offscreenView: GPUTextureView, camPos: Readonly<Vec3>): ReadyFrameContext {
  return {
    drawCamPos: camPos,
    nowMs: 0,
    renderTargets: {
      viewOf: (id: string) => (id === 'star-aggregates' ? offscreenView : ({} as GPUTextureView)),
    },
  } as unknown as ReadyFrameContext;
}

function makeCatalog(): StarCatalog {
  return {
    starCount: 1,
    nodeCount: 1,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [0, 0, 0],
    nodes: [{ mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 }],
    records: new Uint8Array(6),
  };
}

function makeRenderer() {
  const loaded = [{ source: Source.GaiaStars, catalog: makeCatalog() }];
  return {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw: vi.fn(),
  };
}

function makeState(upsample: unknown, renderer: unknown = makeRenderer()): EngineState {
  return {
    gpu: { starCatalogRenderer: renderer, starAggregateUpsample: upsample },
    subsystems: { scheduler: { requestRender: vi.fn() } },
    settings: {
      starCatalogs: {
        enabled: true,
        sizePx: 2.5,
        brightness: 1.0,
        refineThreshold: 0.05,
        glowOverlap: 1.0,
        items: { gaiaStars: { enabled: true, labelEnabled: false } },
      },
    },
  } as unknown as EngineState;
}

const inBand: Vec3 = [0, 0, (inner + (outer - inner) * 0.5) * PC_TO_MPC];

describe('starAggregateUpsampleLayer', () => {
  it('shares the star visibility gate and targets HDR', () => {
    expect(starAggregateUpsampleLayer.enabled).toBe(starCatalogLayer.enabled);
    expect(starAggregateUpsampleLayer.target).toBe('hdr');
  });

  it('calls starAggregateUpsample.draw with the HDR pass and the offscreen view', () => {
    const offscreenView = {} as GPUTextureView;
    const drawSpy = vi.fn();
    const state = makeState({ draw: drawSpy, destroy: vi.fn() });
    starAggregateUpsampleLayer.draw(PASS_STUB, VIEW_STUB, makeCtx(offscreenView, inBand), state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(drawSpy.mock.calls[0]![1]).toBe(offscreenView);
  });

  it('does not throw when starAggregateUpsample is null (defensive null-check)', () => {
    const state = makeState(null);
    expect(() =>
      starAggregateUpsampleLayer.draw(PASS_STUB, VIEW_STUB, makeCtx({} as GPUTextureView, inBand), state),
    ).not.toThrow();
  });
});
