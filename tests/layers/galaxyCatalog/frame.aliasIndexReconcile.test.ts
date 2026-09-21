/**
 * The Layer's `frame` alias-index reconcile: rebuilds and republishes the
 * command palette's PGC alias index only when the pgcAlias sidecar has
 * landed AND `catalogsVersion` has moved past the last build — never once
 * per frame, and never while the sidecar is still loading.
 */
import { describe, it, expect, vi } from 'vitest';

import { frame } from '../../../src/layers/galaxyCatalog/frame';
import { Source } from '../../../src/data/sources';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';

const CTX = {
  snapshot: { visibleSourceMask: 0xffffffff, nowMs: 0 },
  cam: {},
  drawPxPerRad: 100,
} as unknown as FrameView;

const STATE = {
  settings: {
    bias: { mode: 0, absMagLimit: -19 },
    galaxyCatalogs: { sbScale: 1, sbMax: 1, brightness: 1 },
  },
  selectionRows: { select: null },
  subsystems: { fades: { opacityOf: () => 1 } },
} as unknown as PassState;

// Every other limb of `frame` is inert here (no committed hi-res pair, a
// no-op planner walk) — this suite is only about the reconcile ahead of them.
function makeRuntime(opts: {
  committed: () => { value: ReadonlyMap<bigint, readonly string[]> } | null;
  catalogsVersion: () => number;
}) {
  const publish = vi.fn();
  const catalogs = new Map<number, GalaxyCatalog>([
    [Source.Glade, { objIDs: new BigUint64Array([100n]) } as unknown as GalaxyCatalog],
  ]);
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
    get catalogsVersion() {
      return opts.catalogsVersion();
    },
    pgcAlias: { committed: opts.committed },
    publish,
  } as unknown as GalaxyCatalogRuntime;
  return { runtime, publish };
}

// `runtime.publish` also carries the sibling structureMemberCount reconcile's
// calls (Task 2) — every catalogsVersion bump triggers both. Filtered to the
// aliasIndex-bearing calls so this suite stays about its own reconcile only.
function aliasCalls(publish: ReturnType<typeof vi.fn>) {
  return publish.mock.calls.filter(([patch]) => patch !== undefined && 'aliasIndex' in patch);
}

describe('galaxyCatalog frame — alias index reconcile', () => {
  it('does not publish while the pgcAlias slot is uncommitted', () => {
    const { runtime, publish } = makeRuntime({ committed: () => null, catalogsVersion: () => 0 });
    const tick = frame(runtime);

    for (let i = 0; i < 3; i += 1) tick(CTX, STATE);
    expect(aliasCalls(publish)).toHaveLength(0);
  });

  it('publishes once per catalogsVersion bump, not per frame', () => {
    let catalogsVersion = 0;
    let committed: { value: ReadonlyMap<bigint, readonly string[]> } | null = null;
    const { runtime, publish } = makeRuntime({
      committed: () => committed,
      catalogsVersion: () => catalogsVersion,
    });
    const tick = frame(runtime);

    tick(CTX, STATE); // sidecar still loading — no build yet
    expect(aliasCalls(publish)).toHaveLength(0);

    // The one bump: the sidecar commits and the catalog it joins against lands.
    committed = { value: new Map([[100n, ['NGC 1']]]) };
    catalogsVersion = 1;
    tick(CTX, STATE);
    tick(CTX, STATE); // same version again — must not re-fire

    const calls = aliasCalls(publish);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual({
      aliasIndex: [{ pgc: 100, names: ['NGC 1'], source: Source.Glade, localIdx: 0 }],
    });
  });

  // The tier-swap path this PR exists to fix: the sidecar is ALREADY committed
  // (built once) when a SECOND catalogsVersion bump lands with a replaced
  // `catalogs` array — main never rebuilds here, so a stale row set lingers.
  it('rebuilds and republishes on a second catalogsVersion bump with the sidecar already committed', () => {
    let catalogsVersion = 1;
    const catalogs = new Map<number, GalaxyCatalog>([
      [Source.Glade, { objIDs: new BigUint64Array([100n]) } as unknown as GalaxyCatalog],
    ]);
    const committed = {
      value: new Map<bigint, readonly string[]>([
        [100n, ['NGC 1']],
        [200n, ['NGC 2']],
      ]),
    };
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
      get catalogsVersion() {
        return catalogsVersion;
      },
      pgcAlias: { committed: () => committed },
      publish,
    } as unknown as GalaxyCatalogRuntime;
    const tick = frame(runtime);

    tick(CTX, STATE);
    expect(aliasCalls(publish)).toHaveLength(1);
    expect(aliasCalls(publish)[0]![0]).toEqual({
      aliasIndex: [{ pgc: 100, names: ['NGC 1'], source: Source.Glade, localIdx: 0 }],
    });

    // Tier swap: this source's array is replaced wholesale (100n dropped,
    // 200n gained — the wireGalaxyCatalogSourceSlot commit path), and the
    // commit's `bumpCatalogsVersion()` fires again.
    catalogs.clear();
    catalogs.set(Source.Glade, { objIDs: new BigUint64Array([200n]) } as unknown as GalaxyCatalog);
    catalogsVersion = 2;
    tick(CTX, STATE);

    const calls = aliasCalls(publish);
    expect(calls).toHaveLength(2);
    expect(calls[1]![0]).toEqual({
      aliasIndex: [{ pgc: 200, names: ['NGC 2'], source: Source.Glade, localIdx: 0 }],
    });
  });
});
