/**
 * galaxyCatalogPlanner — the disk walk's visible catalogs and the LOD disks' per-source opacity
 * come from the value core hands the planner, never from settings or the fade
 * registry (the state stub carries neither a fade registry nor switches).
 */
import { describe, it, expect, vi } from 'vitest';

import { galaxyCatalogPlanner } from '../../../src/layers/galaxyCatalog/frame';
import { Source } from '../../../src/data/source';
import { galaxyCatalogIdOf } from '../../../src/utils/galaxyCatalogIdOf';
import { makeGalaxyCatalogFade } from '../../fixtures/makeGalaxyCatalogFade';
import { makeGalaxyCatalogItems } from '../../fixtures/makeGalaxyCatalogItems';
import { FRUSTUM_FLOATS_PER_VIEW } from '../../../src/data/camera/frustumFloatsPerView';
import type { DiskWalkInput } from '../../../src/layers/galaxyCatalog/lod/@types/DiskWalkInput';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';

const SNAPSHOT = { nowMs: 0, skyCapturesBaking: new Set() } as unknown as ReadyFrameContext;
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

function walkInputFor(
  fade: ReturnType<typeof makeGalaxyCatalogFade>,
  snapshot = SNAPSHOT,
  views: readonly FrameView[] = VIEWS,
): DiskWalkInput {
  const runFrame = vi.fn();
  const runtime = {
    hiResFamous: { committed: () => null },
    diskPlannerWalk: { runFrame },
    proceduralDisks: { beginFrame: vi.fn(() => ({})) },
    texturedDisks: { beginFrame: vi.fn(() => ({})), hasFadingContent: () => false },
    catalogs: new Map(),
    records: new Map(),
    famousMeta: [],
    catalogsVersion: 0,
    pgcAlias: { committed: () => null },
    publish: vi.fn(),
  } as unknown as GalaxyCatalogRuntime;
  galaxyCatalogPlanner(runtime).plan(snapshot, views, STATE, fade);
  return runFrame.mock.calls[0]![0] as DiskWalkInput;
}

describe('galaxyCatalogPlanner — handed value', () => {
  it('the planner walk hides a catalog whose handed value is 0', () => {
    const input = walkInputFor(makeGalaxyCatalogFade({ sdss: 0 }));
    expect(input.visibleCatalogs.has(galaxyCatalogIdOf(Source.SDSS))).toBe(false);
    expect(input.visibleCatalogs.has(galaxyCatalogIdOf(Source.TwoMRS))).toBe(true);
  });

  it('the LOD disks take the planner handed value', () => {
    const input = walkInputFor(makeGalaxyCatalogFade({ sdss: 0.25 }));
    expect(input.sourceOpacity(Source.SDSS)).toBe(0.25);
    expect(input.sourceOpacity(Source.TwoMRS)).toBe(1);
  });
});

describe('galaxyCatalogPlanner — view cull', () => {
  it('hands the walk every rig view, so a dome face sees its own galaxies', () => {
    const domeFaces = [...VIEWS, ...VIEWS, ...VIEWS, ...VIEWS, ...VIEWS];
    const input = walkInputFor(makeGalaxyCatalogFade({}), SNAPSHOT, domeFaces);
    expect(input.viewPlanes).toHaveLength(domeFaces.length * FRUSTUM_FLOATS_PER_VIEW);
  });

  it('culls nothing while a sky capture bakes: the capture replays the disks on all six faces', () => {
    const baking = { ...SNAPSHOT, skyCapturesBaking: new Set(['sgrAStar']) } as ReadyFrameContext;
    expect(walkInputFor(makeGalaxyCatalogFade({}), baking).viewPlanes).toHaveLength(0);
  });
});
