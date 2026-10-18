/**
 * galaxyCatalogPlanner — the disk walk's mask and the LOD disks' per-source opacity
 * come from the value core hands the planner, never from settings or the fade
 * registry (the state stub carries neither a fade registry nor switches).
 */
import { describe, it, expect, vi } from 'vitest';

import { galaxyCatalogPlanner } from '../../../src/layers/galaxyCatalog/frame';
import { Source } from '../../../src/data/sources';
import { maskHas } from '../../../src/utils/maskHas';
import { makeGalaxyCatalogFade } from '../../fixtures/makeGalaxyCatalogFade';
import { makeGalaxyCatalogItems } from '../../fixtures/makeGalaxyCatalogItems';
import type { DiskWalkInput } from '../../../src/@types/engine/subsystems/DiskWalkInput';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';

const SNAPSHOT = { nowMs: 0 } as unknown as ReadyFrameContext;
const VIEWS = [{ cam: {}, drawPxPerRad: 100 } as unknown as FrameView];
const STATE = {
  settings: {
    bias: { mode: 0, absMagLimit: -19 },
    galaxyCatalogs: { sbScale: 1, sbMax: 1, brightness: 1, items: makeGalaxyCatalogItems() },
  },
  selectionRows: { select: null },
} as unknown as PassState;

function walkInputFor(fade: ReturnType<typeof makeGalaxyCatalogFade>): DiskWalkInput {
  const runFrame = vi.fn();
  const runtime = {
    hiResFamous: { committed: () => null },
    diskPlannerWalk: { runFrame },
    proceduralDisks: { beginFrame: vi.fn(() => ({})) },
    texturedDisks: { beginFrame: vi.fn(() => ({})), hasFadingContent: () => false },
    catalogs: new Map(),
    famousMeta: [],
    catalogsVersion: 0,
    pgcAlias: { committed: () => null },
    publish: vi.fn(),
  } as unknown as GalaxyCatalogRuntime;
  galaxyCatalogPlanner(runtime).plan(SNAPSHOT, VIEWS, STATE, fade);
  return runFrame.mock.calls[0]![0] as DiskWalkInput;
}

describe('galaxyCatalogPlanner — handed value', () => {
  it('the planner walk hides a catalog whose handed value is 0', () => {
    const input = walkInputFor(makeGalaxyCatalogFade({ sdss: 0 }));
    expect(maskHas(input.sourceMask, Source.SDSS)).toBe(false);
    expect(maskHas(input.sourceMask, Source.TwoMRS)).toBe(true);
  });

  it('the LOD disks take the planner handed value', () => {
    const input = walkInputFor(makeGalaxyCatalogFade({ sdss: 0.25 }));
    expect(input.sourceOpacity(Source.SDSS)).toBe(0.25);
    expect(input.sourceOpacity(Source.TwoMRS)).toBe(1);
  });
});
