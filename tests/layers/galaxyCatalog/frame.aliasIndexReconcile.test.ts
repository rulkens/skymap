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
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/types/GalaxyCatalogRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';

const CTX = {
  cam: {},
  visibleSourceMask: 0xffffffff,
  drawPxPerRad: 100,
  nowMs: 0,
} as unknown as ReadyFrameContext;

const STATE = {
  settings: {
    bias: { mode: 0, absMagLimit: -19 },
    galaxyCatalogs: { sbScale: 1, sbMax: 1, brightness: 1 },
  },
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
    texturedDisks: { beginFrame: vi.fn(() => ({})), hasInFlightWork: () => false },
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

describe('galaxyCatalog frame — alias index reconcile', () => {
  it('does not publish while the pgcAlias slot is uncommitted', () => {
    const { runtime, publish } = makeRuntime({ committed: () => null, catalogsVersion: () => 0 });
    const tick = frame(runtime);

    for (let i = 0; i < 3; i += 1) tick(CTX, STATE);
    expect(publish).not.toHaveBeenCalled();
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
    expect(publish).not.toHaveBeenCalled();

    // The one bump: the sidecar commits and the catalog it joins against lands.
    committed = { value: new Map([[100n, ['NGC 1']]]) };
    catalogsVersion = 1;
    tick(CTX, STATE);
    tick(CTX, STATE); // same version again — must not re-fire

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      aliasIndex: [{ pgc: 100, names: ['NGC 1'], source: Source.Glade, localIdx: 0 }],
    });
  });
});
