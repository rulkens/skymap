/**
 * galaxyCatalogPlanner — the structure member count is recomputed when the visible
 * catalogs change, not when `visibleCatalogsOf` merely hands back a new Set object
 * with the same members (it builds one every frame).
 */
import { describe, it, expect, vi } from 'vitest';

import { galaxyCatalogPlanner } from '../../../src/layers/galaxyCatalog/frame';
import { makeGalaxyCatalogFade } from '../../fixtures/makeGalaxyCatalogFade';
import { makeGalaxyCatalogItems } from '../../fixtures/makeGalaxyCatalogItems';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';

const SNAPSHOT = { nowMs: 0, skyCapturesInBand: new Set() } as unknown as ReadyFrameContext;
const VIEWS = [
  {
    cam: { position: [0, 0, 0] },
    drawPxPerRad: 100,
    slabs: [null, { vp: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }],
  } as unknown as FrameView,
];
const STATE = {
  settings: {
    bias: { mode: 0, absMagLimit: -19 },
    galaxyCatalogs: { sbScale: 1, sbMax: 1, brightness: 1, items: makeGalaxyCatalogItems() },
  },
  selectionRows: { select: null },
} as unknown as PassState;

function setup() {
  const publish = vi.fn();
  const runtime = {
    hiResFamous: { committed: () => null },
    diskPlannerWalk: { runFrame: vi.fn() },
    proceduralDisks: { beginFrame: vi.fn(() => ({})) },
    texturedDisks: { beginFrame: vi.fn(() => ({})), hasFadingContent: () => false },
    catalogs: new Map(),
    records: new Map(),
    famousMeta: [],
    catalogsVersion: 0,
    pgcAlias: { committed: () => null },
    publish,
  } as unknown as GalaxyCatalogRuntime;
  const planner = galaxyCatalogPlanner(runtime);
  return {
    publish,
    plan: (fade: ReturnType<typeof makeGalaxyCatalogFade>) =>
      planner.plan(SNAPSHOT, VIEWS, STATE, fade),
  };
}

describe('galaxyCatalogPlanner — member count cache', () => {
  it('does not recompute for a new Set object with the same members', () => {
    const { publish, plan } = setup();
    plan(makeGalaxyCatalogFade());
    plan(makeGalaxyCatalogFade());
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('recomputes when a catalog enters or leaves the visible set', () => {
    const { publish, plan } = setup();
    plan(makeGalaxyCatalogFade());
    plan(makeGalaxyCatalogFade({ sdss: 0 }));
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
