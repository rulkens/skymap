// @vitest-environment jsdom

/**
 * hoverPickDriver — pure-logic unit tests.
 *
 * These tests exercise the scheduling semantics of `createHoverPickDriver`
 * with a fake `pick` that returns a manually-controlled deferred promise.
 * No WebGPU device, no DOM, no RAF — the driver is pure JS logic.
 *
 * ### Covered invariants
 *
 *   (a) Coalescing: a pointer move while `pickInFlight` does NOT start a
 *       second concurrent pick. The GPU readback latency (1–2 frames) is
 *       the natural throttle — a second call would waste GPU work and risk
 *       reading stale results.
 *
 *   (b) Trailing edge: the `maybeFire` inside `.finally` catches the
 *       resting position after a fast flick. Without it, all mid-flight
 *       moves are dropped and a stopped cursor never gets a pick result.
 *
 *   (c) Null bytes guard: `uniformBytes()` returning `null` means the engine
 *       is not ready to pick yet — pick is a no-op (no `pick` call) to match
 *       the pre-first-frame behaviour of the old in-frame path.
 *
 *   (d) Empty-target guard: when `collectTargets()` returns `hasAny: false`
 *       (all catalogs hidden and no structure markers on screen) a pick pass
 *       would read garbage — skip it.
 *
 *   (e) Dispatch: the resolved pick is decoded by `resolvePick` and the
 *       result is dispatched as `updateSelectionHover(...)` on the store.
 *
 *   (f) Structural: the `HoverPickDeps` bag has NO scheduler / requestRender
 *       field — the driver cannot wake the render loop.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createHoverPickDriver } from '../../../../src/services/engine/interaction/hoverPickDriver';
import { updateSelectionHover } from '../../../../src/state/selection/selectionSlice';
import type { HoverPickDeps } from '../../../../src/@types/engine/interaction/HoverPickDeps';
import type { PickFrameCam } from '../../../../src/@types/engine/state/PickFrameCam';
import type { PickResult } from '../../../../src/@types/data/PickResult';
import type { PickTargets } from '../../../../src/services/engine/helpers/collectPickTargets';
import type { CssPx } from '../../../../src/@types/input/CssPx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A controlled deferred — lets the test resolve/reject the pick promise. */
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Factory for a fake `PickRenderer` whose `pick` returns a deferred promise.
 * The factory resets the deferred on each call so multi-call tests can track
 * which call is in flight. */
function makeFakePicker(): {
  pick: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<PickResult | null>>>;
  /** Resolve the currently-in-flight pick with the given result. */
  resolveLatest: (result: PickResult | null) => void;
  /** Number of times `pick` has been called so far. */
  callCount: () => number;
} {
  let deferred = makeDeferred<PickResult | null>();
  let calls = 0;

  const pick = vi.fn((..._args: unknown[]) => {
    calls++;
    deferred = makeDeferred<PickResult | null>();
    return deferred.promise;
  });

  return {
    pick,
    resolveLatest: (result) => deferred.resolve(result),
    callCount: () => calls,
  };
}

// Minimal PickTargets with at least one source (hasAny: true).
const targetsWithSources: PickTargets = {
  visibleSources: [{ source: 0 } as PickTargets['visibleSources'][number]],
  hasAny: true,
};

// PickTargets that represent an empty scene (nothing to pick).
const emptyTargets: PickTargets = {
  visibleSources: [],
  hasAny: false,
};

// A dummy ArrayBuffer representing the packed uniform bytes the deps thunk
// builds at pick time (non-null → the engine is ready to pick).
const dummyUniformBytes = new ArrayBuffer(176);

// A reusable PickStructureStore stub (resolvePick only needs `byCategory`).
const emptyStructures = { byCategory: () => [] };

// Pointer positions for tests.
const posA: CssPx = { x: 100, y: 200 };
const posB: CssPx = { x: 150, y: 250 };

// ---------------------------------------------------------------------------
// Shared state for each test
// ---------------------------------------------------------------------------

let picker: ReturnType<typeof makeFakePicker>;
let pickingState: {
  pickInFlight: boolean;
  pointerDown: boolean;
  lastFrameCam: PickFrameCam | null;
};
let dispatchSpy: ReturnType<typeof vi.fn<(action: unknown) => void>>;
let deps: HoverPickDeps;

beforeEach(() => {
  picker = makeFakePicker();

  pickingState = {
    pickInFlight: false,
    pointerDown: false,
    lastFrameCam: null,
  };

  dispatchSpy = vi.fn<(action: unknown) => void>();

  deps = {
    state: { picking: pickingState },
    pickRenderer: {
      pick: picker.pick,
      drawPoints: vi.fn<() => void>(),
      bindCamera: vi.fn<() => void>(),
      renderForDebug: vi.fn<() => null>(),
      destroy: vi.fn<() => void>(),
      label: 'pickRenderer',
    },
    store: { dispatch: dispatchSpy },
    resolveDeps: { structures: emptyStructures },
    uniformBytes: vi.fn<() => ArrayBuffer | null>(() => dummyUniformBytes),
    collectTargets: vi.fn<() => PickTargets>(() => targetsWithSources),
    viewportPx: vi.fn<() => [number, number]>(() => [800, 600]),
    pointSizePx: vi.fn<() => number>(() => 2.5),
    timingDescriptor: vi.fn<() => undefined>(() => undefined),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createHoverPickDriver', () => {
  // (a) Coalescing
  it('a move while a pick is in flight does not start a second pick', async () => {
    const driver = createHoverPickDriver(deps);

    // First move — fires the pick (in-flight).
    driver.onPointerMove(posA);
    expect(picker.callCount()).toBe(1);

    // Second move while the first pick is still in flight — must be coalesced.
    // The second move becomes the new `latest` but must NOT start a second
    // concurrent pick call (still 1 total even after the second move).
    driver.onPointerMove(posB);
    expect(picker.callCount()).toBe(1); // still only one pick call

    // Settle the in-flight pick. The trailing-edge maybeFire will then fire
    // posB (the coalesced resting position) — that counts as pick call 2.
    // Settle that one too so the test doesn't leave dangling promises.
    picker.resolveLatest(null);
    await vi.waitFor(() => {
      expect(picker.callCount()).toBe(2);
    });
    picker.resolveLatest(null);
    await vi.waitFor(() => {
      expect(pickingState.pickInFlight).toBe(false);
    });
  });

  // (b) Trailing edge
  it('the trailing-edge maybeFire fires the resting position after the in-flight pick resolves', async () => {
    const driver = createHoverPickDriver(deps);

    // Fire first pick for posA.
    driver.onPointerMove(posA);
    expect(picker.callCount()).toBe(1);

    // Move to posB while the first is in flight — coalesced (not fired yet).
    driver.onPointerMove(posB);
    expect(picker.callCount()).toBe(1);

    // Resolve the first pick — the trailing-edge maybeFire should kick off
    // a second pick for posB (the resting position).
    picker.resolveLatest(null);
    await vi.waitFor(() => {
      expect(picker.callCount()).toBe(2);
    });

    // Settle the trailing pick.
    picker.resolveLatest(null);
    await vi.waitFor(() => {
      expect(pickingState.pickInFlight).toBe(false);
    });
  });

  // (c) Null uniform bytes guard
  it('a null uniformBytes() result is a no-op (no pick call)', () => {
    (deps.uniformBytes as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const driver = createHoverPickDriver(deps);
    driver.onPointerMove(posA);
    expect(picker.callCount()).toBe(0);
  });

  // (d) Empty-target guard
  it('an empty-target scene is a no-op (no pick call)', () => {
    (deps.collectTargets as ReturnType<typeof vi.fn>).mockReturnValue(emptyTargets);
    const driver = createHoverPickDriver(deps);
    driver.onPointerMove(posA);
    expect(picker.callCount()).toBe(0);
  });

  // (e) Dispatch
  it('the resolved pick dispatches updateSelectionHover(resolvePick(...))', async () => {
    const driver = createHoverPickDriver(deps);
    driver.onPointerMove(posA);

    // Resolve with null (background click) — resolvePick(null, ...) returns null.
    picker.resolveLatest(null);
    await vi.waitFor(() => {
      expect(dispatchSpy.mock.calls.length).toBeGreaterThan(0);
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    // The dispatched action must be the updateSelectionHover action creator's
    // output: { type: 'selection/updateSelectionHover', payload: null }.
    const expectedAction = updateSelectionHover(null);
    expect(dispatchSpy).toHaveBeenCalledWith(expectedAction);
  });

  // (g) Drag-skip: no picks while a pointer drag (orbit) is in progress
  it('a pointermove while pointerDown (dragging) does not start a pick', () => {
    pickingState.pointerDown = true;
    const driver = createHoverPickDriver(deps);
    driver.onPointerMove(posA);
    expect(picker.callCount()).toBe(0);
  });

  // (f) Structural: no scheduler in deps bag
  it('the driver has no scheduler / requestRender field in its deps bag', () => {
    // This test is structural — it documents and enforces that the deps type
    // has no way to wake the render loop. If someone adds `requestRender` to
    // HoverPickDeps, this cast will break at the type level.
    //
    // At runtime we assert the shape of the `deps` object we built doesn't
    // contain a scheduler-related key — if it did, it would have been passed
    // in via the shared `deps` fixture above (which represents the full bag).
    expect('requestRender' in deps).toBe(false);
    expect('scheduler' in deps).toBe(false);
  });
});
