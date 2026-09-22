/**
 * The Layer's `galaxyCatalogPlanner` structureMemberCount reconcile:
 * recomputes and republishes the InfoCard's "N galaxies" figure only when the
 * (selected row, visible mask, catalogsVersion) key changes — never once per
 * frame — and publishes `null` for anything that isn't a structure selection.
 */
import { describe, it, expect, vi } from 'vitest';

import { galaxyCatalogPlanner } from '../../../src/layers/galaxyCatalog/frame';
import { Source } from '../../../src/data/sources';
import { ALL_VISIBLE_MASK } from '../../../src/utils/allVisibleMask';
import { maskWith } from '../../../src/utils/maskWith';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { SelectionRow } from '../../../src/@types/engine/SelectionRow';

/** A cluster at the origin with a 10 Mpc core radius — mirrors structureMemberCount.test.ts. */
const CLUSTER: SelectionRow = {
  type: 'structure',
  id: 'test-cluster',
  name: 'Test Cluster',
  category: 'cluster',
  worldPos: [0, 0, 0],
  featured: true,
  physicalRadiusMpc: 10,
};

function catalogAt(positions: ReadonlyArray<readonly [number, number, number]>): GalaxyCatalog {
  const flat = new Float32Array(positions.length * 3);
  positions.forEach((p, i) => flat.set(p, i * 3));
  return makeGalaxyCatalog(positions.length, { positions: flat });
}

function makeSnapshot(visibleSourceMask: number): ReadyFrameContext {
  return { visibleSourceMask, nowMs: 0 } as unknown as ReadyFrameContext;
}

const VIEWS = [{ cam: {}, drawPxPerRad: 100 } as unknown as FrameView];

function makeState(select: SelectionRow | null): PassState {
  return {
    settings: {
      bias: { mode: 0, absMagLimit: -19 },
      galaxyCatalogs: { sbScale: 1, sbMax: 1, brightness: 1 },
    },
    selectionRows: { select },
    subsystems: { fades: { opacityOf: () => 1 } },
  } as unknown as PassState;
}

// Every other limb of `frame` is inert here (no committed pgcAlias/hi-res
// pair, a no-op planner walk) — this suite is only about this reconcile.
function makeRuntime(catalogs: Map<number, GalaxyCatalog>) {
  const publish = vi.fn();
  const runtime = {
    biasLastApplied: 0,
    biasCorrection: { setMode: vi.fn() },
    hiResFamous: { committed: () => null },
    diskPlannerWalk: { runFrame: vi.fn() },
    proceduralDisks: { beginFrame: vi.fn(() => ({})) },
    texturedDisks: {
      beginFrame: vi.fn(() => ({})),
      hasInFlightWork: () => false,
      hasFadingContent: () => false,
    },
    catalogs,
    famousMeta: [],
    catalogsVersion: 0,
    pgcAlias: { committed: () => null },
    publish,
  } as unknown as GalaxyCatalogRuntime;
  return { runtime, publish };
}

describe('galaxyCatalog frame — structureMemberCount reconcile', () => {
  it('recomputes only when the key changes', () => {
    const catalogs = new Map([[Source.SDSS, catalogAt([[1, 0, 0]])]]); // 1 inside
    const { runtime, publish } = makeRuntime(catalogs);
    const tick = galaxyCatalogPlanner(runtime);

    tick.plan(makeSnapshot(ALL_VISIBLE_MASK), VIEWS, makeState(CLUSTER)); // primes the key — not asserted
    publish.mockClear();

    for (let i = 0; i < 9; i += 1)
      tick.plan(makeSnapshot(ALL_VISIBLE_MASK), VIEWS, makeState(CLUSTER));
    tick.plan(makeSnapshot(ALL_VISIBLE_MASK), VIEWS, makeState(null)); // the one selection change

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({ structureMemberCount: null });
  });

  it('publishes null when the selected row is not a structure', () => {
    const catalogs = new Map([[Source.SDSS, catalogAt([[1, 0, 0]])]]);
    const { runtime, publish } = makeRuntime(catalogs);
    const tick = galaxyCatalogPlanner(runtime);

    const milkyWay: SelectionRow = { type: 'milkyWay' };
    tick.plan(makeSnapshot(ALL_VISIBLE_MASK), VIEWS, makeState(milkyWay));

    expect(publish).toHaveBeenCalledWith({ structureMemberCount: null });
  });

  it('recomputes when the visible source mask changes with the same selection', () => {
    const catalogs = new Map([
      [Source.SDSS, catalogAt([[1, 0, 0]])], // 1 inside
      [Source.TwoMRS, catalogAt([])], // loaded, no members
    ]);
    const { runtime, publish } = makeRuntime(catalogs);
    const tick = galaxyCatalogPlanner(runtime);

    tick.plan(makeSnapshot(maskWith(0, Source.SDSS)), VIEWS, makeState(CLUSTER));
    expect(publish).toHaveBeenLastCalledWith({ structureMemberCount: 1 });

    // Same selection, same catalogsVersion — only the visible source swapped,
    // which is exactly what the renderer draws and the focus fade tracks.
    tick.plan(makeSnapshot(maskWith(0, Source.TwoMRS)), VIEWS, makeState(CLUSTER));
    expect(publish).toHaveBeenLastCalledWith({ structureMemberCount: 0 });
  });

  it('recomputes when only catalogsVersion changes, same selection and mask (tier-swap recount)', () => {
    let catalogsVersion = 0;
    let catalogs = new Map([[Source.SDSS, catalogAt([[1, 0, 0]])]]); // 1 inside
    const publish = vi.fn();
    const runtime = {
      biasLastApplied: 0,
      biasCorrection: { setMode: vi.fn() },
      hiResFamous: { committed: () => null },
      diskPlannerWalk: { runFrame: vi.fn() },
      proceduralDisks: { beginFrame: vi.fn(() => ({})) },
      texturedDisks: {
        beginFrame: vi.fn(() => ({})),
        hasInFlightWork: () => false,
        hasFadingContent: () => false,
      },
      get catalogs() {
        return catalogs;
      },
      famousMeta: [],
      get catalogsVersion() {
        return catalogsVersion;
      },
      pgcAlias: { committed: () => null },
      publish,
    } as unknown as GalaxyCatalogRuntime;
    const tick = galaxyCatalogPlanner(runtime);

    tick.plan(makeSnapshot(ALL_VISIBLE_MASK), VIEWS, makeState(CLUSTER));
    expect(publish).toHaveBeenLastCalledWith({ structureMemberCount: 1 });

    // Tier swap: same selection, same visible mask, but this source's array
    // was replaced wholesale (a second member gained) and catalogsVersion
    // bumped — must recompute against the new array, not reuse the stale count.
    catalogs = new Map([
      [
        Source.SDSS,
        catalogAt([
          [1, 0, 0],
          [2, 0, 0],
        ]),
      ],
    ]);
    catalogsVersion = 1;
    tick.plan(makeSnapshot(ALL_VISIBLE_MASK), VIEWS, makeState(CLUSTER));
    expect(publish).toHaveBeenLastCalledWith({ structureMemberCount: 2 });
  });
});
