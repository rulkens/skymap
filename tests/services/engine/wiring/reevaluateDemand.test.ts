/**
 * reevaluateDemand — unit tests for the guarded demand-evaluation loop.
 *
 * Tests exercise the factored-out `evaluateRows(state, rows)` with stub rows
 * and stub slots, so the loop logic is verified without the real ASSET_WIRING
 * registry (Task 10). The behaviours under test:
 *
 *   - a row whose demand is true AND whose slot is idle triggers
 *     `slot.load(row.req(tier))`,
 *   - a row whose demand is false does not load,
 *   - a row whose slot is already loading/ready is left alone (the idle-guard
 *     that prevents a re-fetch storm when the loop re-runs on every toggle),
 *   - a throwing demand predicate is caught and does not stop later rows.
 *
 * Mocking strategy: stub slots live in `state.assetSlots.points` keyed by a
 * numeric SourceType; `slot.load` is a vi.fn so calls are assertable. Rows
 * carry numeric keys so `slotFor` resolves them through the points map.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateRows } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { Source } from '../../../../src/data/sources';
import { clampTier } from '../../../../src/utils/math/clampTier';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { Tier } from '../../../../src/@types/data/Tier';

type StubSlot = AssetSlot<unknown, unknown> & {
  load: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  /** Override the reported lifecycle kind so tests can pin the idle/ready guards. */
  setKind: (kind: LoadState<unknown>['kind']) => void;
};

/**
 * A stub slot whose `load` and `release` are spies. `state()` reports a mutable
 * kind (idle by default — the boot model) so tests can simulate a slot that is
 * already loading/ready and assert the idle-guard (load) or ready-guard
 * (release) fires the right edge.
 */
function stubSlot(
  initialKind: LoadState<unknown>['kind'] = 'idle',
  lastReq: unknown = null,
): StubSlot {
  const load = vi.fn();
  const release = vi.fn();
  let kind = initialKind;
  return {
    name: 'stub',
    load: load as unknown as StubSlot['load'],
    current: () => null,
    state: () => ({ kind }) as LoadState<unknown>,
    subscribe: () => () => {},
    // The request the slot last committed with — the stale-tier evict edge reads
    // its tier. Seeded per stub so a test can model a slot resident at a tier.
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

/**
 * Build a minimal EngineState with the slices evaluateRows reads transitively
 * (via buildDemandCtx + slotFor): the `tier` root field, `settings`, `requests`,
 * a `points` map carrying the stub slots, and the `subsystems.assetQueue` the
 * load edge enqueues onto.
 *
 * The queue is constructed PER CALL, never shared: a queue leaked across cases
 * would carry one test's pending entries into the next. It is also mandatory
 * rather than optional — `evaluateRows` guards each row in a try/catch, so a
 * missing queue would surface as a swallowed TypeError and turn every
 * `expect(slot.load).toHaveBeenCalled()` in this file into a silent failure
 * instead of a visible crash.
 */
function makeState(points: Map<SourceType, AssetSlot<unknown, unknown>>): EngineState {
  return {
    tier: 'medium',
    settings: {},
    requests: new Set(),
    assetSlots: { points },
    subsystems: { assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY) },
    // buildDemandCtx assembles the camera eye from pose + projection, so both
    // must be present. A far resting pose keeps the proximity-gated body-texture
    // rows out of the demand set.
    cameraRuntime: {
      lastPose: { current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6 }) },
      displayedPose: {
        current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6 }),
      },
      projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
      lastRenderedSimDays: { current: CONST_J2000 },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
    },
  } as unknown as EngineState;
}

/** A wiring row over a numeric (point-slot) key with overridable demand/release/req. */
function row(
  key: SourceType,
  demand: AssetWiringRow['demand'],
  opts: { release?: AssetWiringRow['release']; req?: AssetWiringRow['req'] } = {},
): AssetWiringRow {
  const req = opts.req ?? ((tier) => ({ source: key, tier }));
  // `priority` is required on the row type but irrelevant to the edges under
  // test here (fetch order is the queue's concern), so every stub row shares 0.
  return { key, factory: () => stubSlot(), req, demand, release: opts.release, priority: 0 };
}

/** A demanded row carrying a real rank — for the fetch-order test, where
 *  `priority` is the thing under test rather than an irrelevant field. */
function ranked(key: SourceType, priority: number): AssetWiringRow {
  return { ...row(key, () => true), priority };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateRows', () => {
  it('loads a row whose demand returns true', () => {
    const slot = stubSlot();
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => true)]);
    expect(slot.load).toHaveBeenCalledTimes(1);
    // The request is derived from the active tier via row.req.
    expect(slot.load).toHaveBeenCalledWith({ source: Source.SDSS, tier: 'medium' });
  });

  it('does not load a row whose demand returns false', () => {
    const slot = stubSlot();
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => false)]);
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('a throwing demand predicate is caught and does not stop later rows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sdss = stubSlot();
    const glade = stubSlot();
    const state = makeState(
      new Map([
        [Source.SDSS, sdss],
        [Source.Glade, glade],
      ]),
    );
    evaluateRows(state, [
      row(Source.SDSS, () => {
        throw new Error('boom');
      }),
      row(Source.Glade, () => true),
    ]);
    // First row's throw is swallowed + warned; the second row still loads.
    expect(sdss.load).not.toHaveBeenCalled();
    expect(glade.load).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('does not re-load a slot that is already ready', () => {
    const slot = stubSlot('ready');
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => true)]);
    // Demanded, but the slot already holds data — the idle-guard skips it so a
    // toggle-driven re-eval doesn't abort + re-fetch a ready galaxy catalog.
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('does not re-load a slot that is already loading', () => {
    const slot = stubSlot('loading');
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => true)]);
    // A fetch is already in flight; re-triggering would abort and restart it.
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('re-evaluation after a slot becomes ready is a no-op for that row', () => {
    // First eval finds the slot idle and loads it; flipping the stub to ready
    // models the slot settling. The second eval must NOT re-load — this pins
    // the toggle-storm prevention the idle-guard exists for.
    const slot = stubSlot('idle');
    const state = makeState(new Map([[Source.SDSS, slot]]));
    const rows = [row(Source.SDSS, () => true)];

    evaluateRows(state, rows);
    expect(slot.load).toHaveBeenCalledTimes(1);

    slot.setKind('ready');
    evaluateRows(state, rows);
    expect(slot.load).toHaveBeenCalledTimes(1);
  });

  it('skips a true-demand row with no slot without throwing', () => {
    // slotFor returns undefined for a key with no minted slot; the optional
    // chain makes the load a no-op rather than a crash.
    const state = makeState(new Map());
    expect(() => evaluateRows(state, [row(Source.SDSS, () => true)])).not.toThrow();
  });

  it('releases a ready slot whose release predicate returns true', () => {
    const slot = stubSlot('ready');
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => false, { release: () => true })]);
    expect(slot.release).toHaveBeenCalledTimes(1);
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('does not release a ready slot whose release predicate returns false', () => {
    const slot = stubSlot('ready');
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => false, { release: () => false })]);
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('never releases a row with no release predicate (load-once default)', () => {
    // The 17 existing rows omit `release`; a ready slot must stay put forever.
    const slot = stubSlot('ready');
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => true)]);
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('does not release an idle slot even when the release predicate is true', () => {
    // The evict edge is guarded on `ready` — an idle slot has nothing committed
    // to release, and the load edge owns the idle state.
    const slot = stubSlot('idle');
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => false, { release: () => true })]);
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
    const started: SourceType[] = [];
    /** A slot whose load records its source and never settles, so the pass's
     *  two concurrency slots stay occupied for the whole assertion. */
    const recordingSlot = (source: SourceType) => {
      const slot = stubSlot();
      slot.load.mockImplementation(() => {
        started.push(source);
        return new Promise<void>(() => {});
      });
      return slot;
    };
    const state = makeState(
      new Map([
        [Source.SDSS, recordingSlot(Source.SDSS)],
        [Source.Glade, recordingSlot(Source.Glade)],
        [Source.TwoMRS, recordingSlot(Source.TwoMRS)],
      ]),
    );

    evaluateRows(state, [
      ranked(Source.SDSS, 60),
      ranked(Source.Glade, 10),
      ranked(Source.TwoMRS, 0),
    ]);

    // Exactly ASSET_QUEUE_CONCURRENCY loads, and they are the two best ranks in
    // rank order — SDSS, first in the array and worst-ranked, waits its turn.
    expect(started).toEqual([Source.TwoMRS, Source.Glade]);
  });

  it('a throwing release predicate is caught and does not stop later rows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sdss = stubSlot('ready');
    const glade = stubSlot('ready');
    const state = makeState(
      new Map([
        [Source.SDSS, sdss],
        [Source.Glade, glade],
      ]),
    );
    evaluateRows(state, [
      row(Source.SDSS, () => false, {
        release: () => {
          throw new Error('boom');
        },
      }),
      row(Source.Glade, () => false, { release: () => true }),
    ]);
    // First row's throw is swallowed + warned; the second row still evicts.
    expect(sdss.release).not.toHaveBeenCalled();
    expect(glade.release).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe('evaluateRows — bodyTextures stale-tier evict', () => {
  /** A body-texture row (key routes through the bodyTextures map) whose req
   *  clamps the tier to Earth's 'large' ceiling — so req('small').tier === 'small'. */
  const earthRow: AssetWiringRow = {
    key: 'earth:surface',
    factory: () => stubSlot(),
    req: (tier) => ({ bodyId: 'earth', kind: 'surface', tier: clampTier(tier, 'large') }),
    demand: () => false,
    priority: 0,
  };

  /** A low-ceiling body-texture row (Uranus ships only up to 'small'). */
  const uranusRow: AssetWiringRow = {
    key: 'uranus:surface',
    factory: () => stubSlot(),
    req: (tier) => ({ bodyId: 'uranus', kind: 'surface', tier: clampTier(tier, 'small') }),
    demand: () => false,
    priority: 0,
  };

  /** State with `slot` in the keyed bodyTextures map under `key` at the given tier. */
  function makeBodyState(key: string, slot: AssetSlot<unknown, unknown>, tier: Tier): EngineState {
    return {
      tier,
      settings: {},
      requests: new Set(),
      assetSlots: { points: new Map(), bodyTextures: new Map([[key, slot]]) },
      // Per-call queue, for the same reasons spelled out on `makeState`.
      subsystems: { assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY) },
      cameraRuntime: {
        lastPose: { current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6 }) },
        displayedPose: {
          current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6 }),
        },
        projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
        lastRenderedSimDays: { current: CONST_J2000 },
        upBasis: { current: ORIENTATION_FRAMES.ecliptic },
      },
    } as unknown as EngineState;
  }

  it('releases a ready slot whose committed tier no longer matches the current tier', () => {
    // Resident at 'medium', current tier 'small' ⇒ clamped req tier 'small' ≠
    // 'medium' ⇒ release so it re-fetches at the new tier.
    const slot = stubSlot('ready', { bodyId: 'earth', tier: 'medium' });
    evaluateRows(makeBodyState('earth:surface', slot, 'small'), [earthRow]);
    expect(slot.release).toHaveBeenCalledTimes(1);
  });

  it('leaves a ready slot whose committed tier already matches alone', () => {
    const slot = stubSlot('ready', { bodyId: 'earth', tier: 'small' });
    evaluateRows(makeBodyState('earth:surface', slot, 'small'), [earthRow]);
    expect(slot.release).not.toHaveBeenCalled();
  });

  it('does NOT thrash a slot resident at its ceiling while the tier sits above it', () => {
    // Uranus tops out at 'small'. Resident at 'small' with the data-volume tier
    // at 'large': the comparison must be against the CLAMPED req tier
    // (clampTier('large','small') === 'small'), so committed === wanted and the
    // slot is left alone. Comparing against the raw tier ('large') would release
    // and re-load every re-evaluation forever — the bug the clamp prevents.
    const slot = stubSlot('ready', { bodyId: 'uranus', tier: 'small' });
    evaluateRows(makeBodyState('uranus:surface', slot, 'large'), [uranusRow]);
    expect(slot.release).not.toHaveBeenCalled();
  });
});
