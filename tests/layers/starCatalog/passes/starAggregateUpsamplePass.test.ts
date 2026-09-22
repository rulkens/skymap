/**
 * starAggregateUpsamplePass — the HDR composite that reads the half-res
 * `star-aggregates` offscreen and adds the knee'd result into HDR. Pins that
 * `draw` calls `starAggregateUpsample.draw` with the HDR pass + the
 * 'star-aggregates' offscreen view; the shared gate is `starSourcesInBand`'s
 * coverage (`starSourcesInBand.test.ts`).
 */

import { describe, it, expect, vi } from 'vitest';

import { starAggregateUpsamplePass } from '../../../../src/layers/starCatalog/passes/starAggregateUpsamplePass';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { Source } from '../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../src/layers/starCatalog/sources/gaia-stars';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogSettings } from '../../../../src/@types/settings/StarCatalogSettings';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;
const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;

const VIEW_STUB = {} as SlabView;
const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

/** ctx whose 'star-aggregates' offscreen view is a captured sentinel. */
function makeCtx(offscreenView: GPUTextureView, camPos: Readonly<Vec3>): FrameView {
  return {
    snapshot: {
      nowMs: 0,
      renderTargets: {
        viewOf: (id: string) => (id === 'star-aggregates' ? offscreenView : ({} as GPUTextureView)),
      },
    },
    drawCamPos: camPos,
  } as unknown as FrameView;
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

function makeRuntime(upsample: unknown): StarCatalogRuntime {
  const loaded = [{ source: Source.GaiaStars, catalog: makeCatalog() }];
  const renderer = {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw: vi.fn(),
  };
  return { renderer, aggregateUpsample: upsample } as unknown as StarCatalogRuntime;
}

function makeSettings(): StarCatalogSettings {
  return {
    enabled: true,
    sizePx: 2.5,
    brightness: 1.0,
    refineThreshold: 0.05,
    glowOverlap: 1.0,
    aggregateIntensityCap: 0.06,
    items: { gaiaStars: { enabled: true, labelEnabled: false } },
  } as unknown as StarCatalogSettings;
}

function makePassState(): PassState {
  return { settings: { starCatalogs: makeSettings() } } as unknown as PassState;
}

const inBand: Vec3 = [0, 0, (inner + (outer - inner) * 0.5) * PC_TO_MPC];

describe('starAggregateUpsamplePass', () => {
  it('calls starAggregateUpsample.draw with the HDR pass and the offscreen view', () => {
    const offscreenView = {} as GPUTextureView;
    const drawSpy = vi.fn();
    const runtime = makeRuntime({ draw: drawSpy, destroy: vi.fn() });
    const pass = starAggregateUpsamplePass(runtime);
    pass.draw!(PASS_STUB, VIEW_STUB, makeCtx(offscreenView, inBand), makePassState());
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(drawSpy.mock.calls[0]![1]).toBe(offscreenView);
  });
});
