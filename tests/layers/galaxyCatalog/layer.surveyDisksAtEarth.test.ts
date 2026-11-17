/**
 * Selecting a famous galaxy at Earth makes the survey records resident (the `selects` lift).
 * The point sprites stay at 0 inside the deep-zoom band, so the disks must too: the Layer's
 * gated planners hand the disk walk the banded value, and famous stays exempt.
 */

import { describe, expect, it, vi } from 'vitest';

import { APP_VISIBILITY_REGISTRY } from '../../../src/compositions/appVisibility';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { galaxyCatalogLayer } from '../../../src/layers/galaxyCatalog/layer';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { gatePlannerByFade } from '../../../src/services/engine/layer/gatePlannerByFade';
import { makeGalaxyCatalogItems } from '../../fixtures/makeGalaxyCatalogItems';
import { galaxyPlannerViewOf } from '../../helpers/frame/galaxyPlannerViewOf';
import type { DiskWalkInput } from '../../../src/layers/galaxyCatalog/lod/@types/DiskWalkInput';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';

const SNAPSHOT = { nowMs: 0 } as unknown as ReadyFrameContext;
const AU = SCALE_UNITS.AU_TO_MPC;
const AT_EARTH = { ...galaxyPlannerViewOf([AU, 0, 0]), drawCamPos: [AU, 0, 0] } as FrameView;
const STATE = {
  settings: {
    galaxyCatalogs: { sbScale: 1, sbMax: 1, brightness: 1, items: makeGalaxyCatalogItems() },
  },
  selectionRows: { select: null },
} as unknown as PassState;

function walkInputAtEarth(): DiskWalkInput {
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
  const engine = {
    subsystems: {
      fades: createFadeRegistry({ requestRender: () => {} }),
      clipPlayer: { clipOpacityOf: () => 1 },
    },
    visibilityEntries: APP_VISIBILITY_REGISTRY,
  } as unknown as Pick<EngineState, 'subsystems' | 'visibilityEntries'>;
  for (const planner of galaxyCatalogLayer.planners!(runtime as never)) {
    const gated = gatePlannerByFade(planner, engine);
    if (gated.scope !== 'once') throw new Error('expected once-scope planners');
    gated.plan(SNAPSHOT, [AT_EARTH], STATE);
  }
  expect(runFrame).toHaveBeenCalledTimes(1);
  return runFrame.mock.calls[0]![0] as DiskWalkInput;
}

describe('galaxyCatalog Layer — survey disks at Earth', () => {
  it('keeps survey catalogs out of the disk walk inside the deep-zoom band', () => {
    const { visibleCatalogs } = walkInputAtEarth();
    expect(visibleCatalogs.has('sdss')).toBe(false);
    expect(visibleCatalogs.has('famousGalaxy')).toBe(true);
  });

  it('gives survey disks opacity 0 and leaves famous disks at full', () => {
    const { sourceOpacity } = walkInputAtEarth();
    expect(sourceOpacity('sdss')).toBe(0);
    expect(sourceOpacity('famousGalaxy')).toBe(1);
  });
});
