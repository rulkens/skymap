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
 *   (c) No pre-fire gate: the driver always hands the position to
 *       `pickProgram.pick` — the program owns the "is the engine ready / is
 *       anything pickable" decisions and resolves to `null` for a not-ready
 *       or empty scene, which decodes to "nothing hovered". So even a
 *       null-resolving pick still FIRES (one `pick` call) and dispatches
 *       `updateSelectionHover(null)`.
 *
 *   (e) Dispatch: the resolved pick is decoded by `resolvePick` and the
 *       result is dispatched as `updateSelectionHover(...)` on the store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createHoverPickDriver } from '../../../../src/services/engine/interaction/hoverPickDriver';
import { updateSelectionHover } from '../../../../src/state/selection/selectionSlice';
import type { HoverPickDeps } from '../../../../src/@types/engine/interaction/HoverPickDeps';
import type { PickResult } from '../../../../src/@types/data/PickResult';
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

/** Factory for a fake `PickProgram` whose `pick` returns a deferred promise.
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
  hoveredSurfacePoint: null;
};
let dispatchSpy: ReturnType<typeof vi.fn<(action: unknown) => void>>;
let deps: HoverPickDeps;

beforeEach(() => {
  picker = makeFakePicker();

  pickingState = {
    pickInFlight: false,
    pointerDown: false,
    hoveredSurfacePoint: null,
  };

  dispatchSpy = vi.fn<(action: unknown) => void>();

  deps = {
    state: { picking: pickingState },
    pickProgram: {
      label: 'pickProgram',
      pick: picker.pick,
      renderForDebug: vi.fn<() => readonly GPUTexture[]>(() => []),
      destroy: vi.fn<() => void>(),
    },
    store: { dispatch: dispatchSpy },
    resolveDeps: { structures: emptyStructures },
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

  // (c) No pre-fire gate: a null-resolving pick still fires + dispatches null
  it('fires the pick even when the program resolves null, dispatching hover(null)', async () => {
    // There is no pre-fire "is anything pickable / is the engine ready" gate
    // anymore — the program owns that and resolves to null for a not-ready or
    // empty scene. The driver must still FIRE (one pick call) and dispatch the
    // decoded result, which is `updateSelectionHover(null)`.
    const driver = createHoverPickDriver(deps);
    driver.onPointerMove(posA);
    expect(picker.callCount()).toBe(1);

    picker.resolveLatest(null);
    await vi.waitFor(() => {
      expect(dispatchSpy.mock.calls.length).toBeGreaterThan(0);
    });
    expect(dispatchSpy).toHaveBeenCalledWith(updateSelectionHover(null));
  });

  // (g) Drag-skip: no picks while a pointer drag (orbit) is in progress
  it('a pointermove while pointerDown (dragging) does not start a pick', () => {
    pickingState.pointerDown = true;
    const driver = createHoverPickDriver(deps);
    driver.onPointerMove(posA);
    expect(picker.callCount()).toBe(0);
  });
});
