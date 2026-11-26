/**
 * reevaluateDemand — the guarded demand-evaluation loop, via `evaluateRows(state, rows)` with stub
 * rows and slots. A demanded row with an idle slot triggers `slot.load(row.req(tier))`; an undemanded
 * row does not load; a loading/ready slot is left alone (the idle-guard against a re-fetch storm); a
 * non-idle slot whose request drifted reloads in place, never releases; a throwing predicate is caught
 * and does not stop later rows. Each stub row carries its stub slot, also indexed in
 * `state.slotsByKey` under the row's SourceId key (as `createLayers` does).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateRows } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { galaxyCatalogRequest } from '../../../../src/layers/galaxyCatalog/records/load/galaxyCatalogRequest';
import { createAssetSlot } from '../../../../src/services/loading/AssetSlot';
import { clampTier } from '../../../../src/utils/math/clampTier';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';
import { absoluteArm } from '../../../../src/utils/camera/arms/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetDemand } from '../../../../src/@types/loading/AssetDemand';
import type { AssetDemandVerdict } from '../../../../src/@types/loading/AssetDemandVerdict';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceId } from '../../../../src/@types/data/SourceId';
import type { Tier } from '../../../../src/@types/data/Tier';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/terrain/datumOnlyTerrainHeight';

type DemandFn = () => boolean;

/** The loop is under test, not the declarations: a stub row carries its verdict as functions, which
 *  this stand-in for the evaluator reads. Real declarations meet the real evaluator elsewhere. */
type StubDemand = { stub: { demand: DemandFn; release?: DemandFn } };

vi.mock('../../../../src/services/engine/wiring/evaluateAssetDemand', () => ({
  evaluateAssetDemand: (row: { demand: StubDemand }): AssetDemandVerdict => ({
    demand: row.demand.stub.demand(),
    release: row.demand.stub.release?.() ?? false,
  }),
}));

const stubDemand = (demand: DemandFn, release?: DemandFn): AssetDemand =>
  ({ stub: { demand, release } }) as unknown as AssetDemand;

type StubSlot = AssetSlot<unknown, unknown> & {
  load: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  setKind: (kind: LoadState<unknown>['kind']) => void;
};

function stubSlot(
  initialKind: LoadState<unknown>['kind'] = 'idle',
  lastReq: unknown = null,
  // Non-null by default: the evict edge gates on a payload being resident, and
  // every kind this file drives past `idle` models a slot that has one.
  committedValue: unknown = {},
): StubSlot {
  const load = vi.fn();
  const release = vi.fn();
  let kind = initialKind;
  return {
    name: 'stub',
    load: load as unknown as StubSlot['load'],
    current: () => null,
    committed: () => committedValue as ReturnType<AssetSlot<unknown, unknown>['committed']>,
    state: () => ({ kind }) as LoadState<unknown>,
    subscribe: () => () => {},
    // The request of the slot's last load ATTEMPT — what the drift edge compares
    // against. Seeded per stub so a test can model a slot loaded at another tier.
    lastRequest: () => lastReq,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: release as unknown as StubSlot['release'],
    setKind: (next) => {
      kind = next;
    },
  };
}

/** Minimal EngineState with the slices evaluateRows reads via buildDemandCtx. The assetQueue is built
 *  PER CALL (a shared queue would leak pending entries between cases) and is mandatory: `evaluateRows`
 *  try/catches each row, so a missing queue would be a swallowed TypeError that turns every
 *  `expect(slot.load)` into a silent failure. */
function makeState(
  points: Map<SourceId, AssetSlot<unknown, unknown>>,
  assetQueue: unknown = new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY),
): EngineState {
  return {
    tier: 'medium',
    settings: {},
    requests: new Set(),
    subsystems: { assetQueue },
    terrainHeightAt: datumOnlyTerrainHeight,
    cameraRuntime: {
      register: { pose: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6 }) },
      outputs: {
        displayed: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6 }),
        projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
        simDays: CONST_J2000,
        upBasis: ORIENTATION_FRAMES.ecliptic,
      },
    },
    slotsByKey: points,
    visibilityEntries: [],
    selection: { hover: null, select: null, focus: null, pending: { select: null, focus: null } },
  } as unknown as EngineState;
}

function row(
  slot: AssetSlot<unknown, unknown>,
  key: SourceId,
  demand: DemandFn,
  opts: { release?: DemandFn; req?: AssetWiringRow['req'] } = {},
): AssetWiringRow {
  const req = opts.req ?? ((tier) => ({ source: key, tier }));
  // `priority` is required on the row type but irrelevant to the edges under
  // test here (fetch order is the queue's concern), so every stub row shares 0.
  return { key, slot, req, demand: stubDemand(demand, opts.release), priority: 0 };
}

/** A queue whose calls are assertable — for the edges that must reach it with
 *  nothing, where a real queue would swallow the distinction. */
function stubQueue() {
  return { enqueueMany: vi.fn(), drop: vi.fn() };
}

/** A demanded row carrying a real rank — for the fetch-order test, where
 *  `priority` is the thing under test rather than an irrelevant field. */
function ranked(
  slot: AssetSlot<unknown, unknown>,
  key: SourceId,
  priority: number,
): AssetWiringRow {
  return { ...row(slot, key, () => true), priority };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateRows', () => {
  it('loads a row whose demand returns true', () => {
    const slot = stubSlot();
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => true)]);
    expect(slot.load).toHaveBeenCalledTimes(1);
    expect(slot.load).toHaveBeenCalledWith({ source: 'sdss', tier: 'medium' });
  });

  it('does not load a row whose demand returns false', () => {
    const slot = stubSlot();
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => false)]);
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('a throwing demand predicate is caught and does not stop later rows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sdss = stubSlot();
    const glade = stubSlot();
    const state = makeState(
      new Map([
        ['sdss', sdss],
        ['glade', glade],
      ]),
    );
    evaluateRows(state, [
      row(sdss, 'sdss', () => {
        throw new Error('boom');
      }),
      row(glade, 'glade', () => true),
    ]);
    // First row's throw is swallowed + warned; the second row still loads.
    expect(sdss.load).not.toHaveBeenCalled();
    expect(glade.load).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('does not re-load a slot that is already ready', () => {
    const slot = stubSlot('ready');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => true)]);
    // Demanded, but the slot already holds data — the idle-guard skips it so a
    // toggle-driven re-eval doesn't abort + re-fetch a ready galaxy catalog.
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('releases a ready slot whose release predicate returns true', () => {
    const slot = stubSlot('ready');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => false, { release: () => true })]);
    expect(slot.release).toHaveBeenCalledTimes(1);
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('an errored slot holding a committed value is released when its release predicate fires', () => {
    // A reload that exhausts its retries leaves the slot `error` with the OLD
    // payload still committed and drawing. Nothing but this edge frees it, so a
    // `ready`-only gate pins a whole-globe texture in VRAM for the session.
    const slot = stubSlot('error');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => false, { release: () => true })]);
    expect(slot.release).toHaveBeenCalledTimes(1);
  });

  it('leaves a loading slot whose row says release alone, and releases it once ready', () => {
    // The evict edge fires on `ready`/`error` only: a fetch in flight finishes, then goes.
    const slot = stubSlot('loading');
    const state = makeState(new Map([['sdss', slot]]));
    const rows = [row(slot, 'sdss', () => false, { release: () => true })];
    evaluateRows(state, rows);
    expect(slot.release).not.toHaveBeenCalled();
    expect(slot.load).not.toHaveBeenCalled();
    slot.setKind('ready');
    evaluateRows(state, rows);
    expect(slot.release).toHaveBeenCalledTimes(1);
  });

  it('does not release a ready slot whose release predicate returns false', () => {
    const slot = stubSlot('ready');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => false, { release: () => false })]);
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('never releases a row with no release predicate (load-once default)', () => {
    const slot = stubSlot('ready');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => true)]);
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('does not release an idle slot even when the release predicate is true', () => {
    // The drop edge claims every idle slot before the evict edge is reached.
    const slot = stubSlot('idle');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => false, { release: () => true })]);
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('starts the best-ranked demanded rows first, whatever their table position', () => {
    // The regression this pins: a single pass submitted its loads row by row,
    // so the first ASSET_QUEUE_CONCURRENCY demanded rows WALKED started
    // immediately and `priority` only decided who filled a slot that freed
    // later. In the real table that let a rank-60 all-sky survey, second in the
    // array, hold one of the two pipes for 22 s ahead of everything the opening
    // view draws. Rows here are ordered worst-rank-first so array order and rank
    // order disagree completely.
    const started: SourceId[] = [];
    /** A slot whose load records its source and never settles, so the pass's
     *  two concurrency slots stay occupied for the whole assertion. */
    const recordingSlot = (source: SourceId) => {
      const slot = stubSlot();
      slot.load.mockImplementation(() => {
        started.push(source);
        return new Promise<void>(() => {});
      });
      return slot;
    };
    const sdss = recordingSlot('sdss');
    const glade = recordingSlot('glade');
    const twoMrs = recordingSlot('2mrs');
    const state = makeState(
      new Map([
        ['sdss', sdss],
        ['glade', glade],
        ['2mrs', twoMrs],
      ]),
    );

    evaluateRows(state, [
      ranked(sdss, 'sdss', 60),
      ranked(glade, 'glade', 10),
      ranked(twoMrs, '2mrs', 0),
    ]);

    // Exactly ASSET_QUEUE_CONCURRENCY loads, and they are the two best ranks in
    // rank order — SDSS, first in the array and worst-ranked, waits its turn.
    expect(started).toEqual(['2mrs', 'glade']);
  });

  it('does not start a queued fetch whose demand turned false while it waited', async () => {
    // A tier swap between enqueue and start can exclude a source whose file no
    // longer exists; the queue's gap must not turn a stale decision into a fetch.
    const first = stubSlot();
    let finishFirst: () => void = () => {};
    first.load.mockImplementation(() => new Promise<void>((r) => (finishFirst = r)));
    const second = stubSlot();
    second.load.mockReturnValue(new Promise<void>(() => {}));
    const waiting = stubSlot();
    let demanded = true;
    const state = makeState(
      new Map([
        ['2mrs', first],
        ['glade', second],
        ['sdss', waiting],
      ]),
    );

    evaluateRows(state, [
      ranked(first, '2mrs', 0),
      ranked(second, 'glade', 1),
      { ...ranked(waiting, 'sdss', 2), demand: stubDemand(() => demanded) },
    ]);
    expect(waiting.load).not.toHaveBeenCalled();

    demanded = false;
    finishFirst();
    await new Promise((r) => setTimeout(r, 0));

    expect(waiting.load).not.toHaveBeenCalled();
  });
});

describe('evaluateRows — drift edge', () => {
  const drifted = (kind: LoadState<unknown>['kind']) =>
    stubSlot(kind, { source: 'sdss', tier: 'small' });

  it('a ready slot whose request drifted is re-loaded, not released', () => {
    // The headline of the drift edge: a tier swap replaces the resident payload
    // in place. Releasing would blank the catalog for the length of the refetch.
    const slot = drifted('ready');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => true)]);
    expect(slot.load).toHaveBeenCalledTimes(1);
    expect(slot.load).toHaveBeenCalledWith({ source: 'sdss', tier: 'medium' });
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('an errored slot whose request drifted is re-loaded', () => {
    // A slot that gave up at the old request is not stuck: the new request is a
    // different fetch, so the edge is not gated on `ready`.
    const slot = drifted('error');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => true)]);
    expect(slot.load).toHaveBeenCalledTimes(1);
  });

  it('a drifted slot whose demand is false is left alone', () => {
    // Drift answers WHICH request, never WHETHER — an undemanded row stays put.
    const slot = drifted('ready');
    const queue = stubQueue();
    evaluateRows(makeState(new Map([['sdss', slot]]), queue), [row(slot, 'sdss', () => false)]);
    expect(slot.load).not.toHaveBeenCalled();
    expect(slot.release).not.toHaveBeenCalled();
    expect(queue.enqueueMany).toHaveBeenCalledWith([]);
  });

  it('a ready slot whose release predicate fires is released, not reloaded', () => {
    // Both reasons apply; the distance edge wins, and the released slot comes
    // back through the idle edges rather than reloading at the old distance.
    const slot = drifted('ready');
    const state = makeState(new Map([['sdss', slot]]));
    evaluateRows(state, [row(slot, 'sdss', () => true, { release: () => true })]);
    expect(slot.release).toHaveBeenCalledTimes(1);
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('a drifted loading slot is superseded by a direct load', () => {
    // Direct, not queued: the queue refuses a key it already has in flight
    // (`PriorityQueue.admit`), which is precisely this case, so an enqueue would
    // be dropped on the floor. `load()` aborts the superseded attempt itself.
    const slot = drifted('loading');
    const queue = stubQueue();
    evaluateRows(makeState(new Map([['sdss', slot]]), queue), [row(slot, 'sdss', () => true)]);
    expect(slot.load).toHaveBeenCalledTimes(1);
    expect(slot.load).toHaveBeenCalledWith({ source: 'sdss', tier: 'medium' });
    expect(queue.enqueueMany).toHaveBeenCalledWith([]);
  });

  it('a superseded queued fetch does not surface as a queue error or retry', async () => {
    // End-to-end over the REAL slot and queue: pass one enqueues and the queue's
    // closure awaits `slot.load`; pass two finds it loading at the wrong tier and
    // aborts it with a direct load. `runLoad` turns the abort into a silent
    // return, so the queue's entry RESOLVES — a rejection would take the
    // `onResult(null)` arm and, for any caller that retries on it, re-fetch the
    // tier the user just left.
    const aborted = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
    const real = createAssetSlot<number, unknown>({
      name: 'sdss',
      // Never settles on its own — only supersession ends it.
      fetch: (_req, signal) =>
        new Promise<number>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(aborted()), { once: true });
        }),
    });
    const attempts: Promise<void>[] = [];
    const slot: AssetSlot<unknown, unknown> = {
      ...(real as unknown as AssetSlot<unknown, unknown>),
      load: (req) => {
        const p = real.load(req);
        attempts.push(p);
        return p;
      },
    };

    const queue = new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY);
    const state = makeState(new Map([['sdss', slot]]), queue);
    const rows = [
      row(slot, 'sdss', () => true, {
        req: (tier) => galaxyCatalogRequest('sdss', tier),
      }),
    ];

    evaluateRows(state, rows);
    const [queued] = attempts;
    if (!queued) throw new Error('the queue did not start the enqueued load');
    const settled: string[] = [];
    void queued.then(
      () => settled.push('resolved'),
      () => settled.push('rejected'),
    );

    (state as { tier: Tier }).tier = 'small';
    evaluateRows(state, rows);
    expect(attempts).toHaveLength(2);

    await queue.drain();
    expect(settled).toEqual(['resolved']);
    expect(queue.inFlightCount()).toBe(0);
    // The slot is loading the NEW request; the aborted attempt left no error
    // state behind for a retry policy to act on.
    expect(slot.state()).toMatchObject({
      kind: 'loading',
      req: galaxyCatalogRequest('sdss', 'small'),
    });
  });
});

describe('evaluateRows — body textures at a stale tier', () => {
  const earthRow = (slot: AssetSlot<unknown, unknown>): AssetWiringRow => ({
    key: 'earth:surface',
    slot,
    req: (tier) => ({ bodyId: 'earth', kind: 'surface', tier: clampTier(tier, 'large') }),
    demand: stubDemand(() => true),
    priority: 0,
  });

  const uranusRow = (slot: AssetSlot<unknown, unknown>): AssetWiringRow => ({
    key: 'uranus:surface',
    slot,
    req: (tier) => ({ bodyId: 'uranus', kind: 'surface', tier: clampTier(tier, 'small') }),
    demand: stubDemand(() => true),
    priority: 0,
  });

  function makeBodyState(key: string, slot: AssetSlot<unknown, unknown>, tier: Tier): EngineState {
    return {
      tier,
      settings: {},
      requests: new Set(),
      subsystems: { assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY) },
      terrainHeightAt: datumOnlyTerrainHeight,
      cameraRuntime: {
        register: { pose: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6 }) },
        outputs: {
          displayed: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6 }),
          projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
          simDays: CONST_J2000,
          upBasis: ORIENTATION_FRAMES.ecliptic,
        },
      },
      slotsByKey: new Map([[key, slot]]),
      visibilityEntries: [],
      selection: { hover: null, select: null, focus: null, pending: { select: null, focus: null } },
    } as unknown as EngineState;
  }

  it('reloads a ready slot in place when its tier no longer matches the current one', () => {
    // Loaded at 'medium', current tier 'small' ⇒ clamped req tier 'small' ≠
    // 'medium' ⇒ the drift edge re-fetches at the new tier. The texture on the
    // GPU stays bound meanwhile; releasing it would show an untextured body.
    const slot = stubSlot('ready', { bodyId: 'earth', kind: 'surface', tier: 'medium' });
    evaluateRows(makeBodyState('earth:surface', slot, 'small'), [earthRow(slot)]);
    expect(slot.load).toHaveBeenCalledTimes(1);
    expect(slot.load).toHaveBeenCalledWith({ bodyId: 'earth', kind: 'surface', tier: 'small' });
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('leaves a ready slot whose tier already matches alone', () => {
    const slot = stubSlot('ready', { bodyId: 'earth', kind: 'surface', tier: 'small' });
    evaluateRows(makeBodyState('earth:surface', slot, 'small'), [earthRow(slot)]);
    expect(slot.load).not.toHaveBeenCalled();
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('does NOT thrash a slot resident at its ceiling while the tier sits above it', () => {
    // Uranus tops out at 'small'. Resident at 'small' with the data-volume tier
    // at 'large': the comparison must be against the CLAMPED req tier
    // (clampTier('large','small') === 'small'), so loaded === wanted and the slot
    // is left alone. Comparing against the raw tier ('large') would re-load every
    // re-evaluation forever — the bug the clamp prevents.
    const slot = stubSlot('ready', { bodyId: 'uranus', kind: 'surface', tier: 'small' });
    evaluateRows(makeBodyState('uranus:surface', slot, 'large'), [uranusRow(slot)]);
    expect(slot.load).not.toHaveBeenCalled();
  });
});
