/**
 * AssetSlot — the one and only stateful module of the loading subsystem.
 *
 * Owns the entire load lifecycle for one asset:
 *
 *     load(req)
 *        │
 *        ▼
 *     [bump generation, abort prior controller, allocate new]
 *        │
 *        ▼
 *     [retry loop: fetch → on success break, on transient err sleep]
 *        │
 *        ▼ ── First race-check: myGen === generation? if not, drop
 *        │
 *        ▼
 *     [await prior commit-in-flight (commit serialization chain)]
 *        │
 *        ▼ ── Third race-check: still current after the wait?
 *        │
 *        ▼
 *     [commit (await — async, e.g. GPU upload)]
 *        │
 *        ▼ ── Second race-check: myGen === generation? if not, drop
 *        │
 *        ▼
 *     [dispatch 'committed', notify subscribers]
 *
 * The three race-checks plus the commit-serialization chain together form
 * the structural fix for the tier-swap bug:
 *
 *   - First check (post-fetch): drops a superseded fetch result before
 *     it touches commit at all.
 *   - Commit chain (await prior): guarantees that two commits for the
 *     same slot run sequentially, even when the side-effect itself
 *     (e.g. a GPU worker bake) can't be aborted mid-flight.  Without
 *     this, "last writer wins" semantics in the renderer cause the
 *     slower (older-tier) commit to overwrite the newer one.
 *   - Third check (post-wait): a generation that arrived while we were
 *     queued doesn't need our commit — the newer one will do it.  Drop
 *     without dispatching 'committing' or running our commit.
 *   - Second check (post-commit): a late-finishing superseded commit
 *     still ran (its side-effect already happened) but we suppress its
 *     'committed' notification so subscribers don't see the stale value.
 *
 * Mutable state is intentionally a thin shell: a generation counter, an
 * AbortController reference, the current LoadState (computed via the pure
 * `reduceLoadState`), a Set of subscribers, and the commit-chain head.
 * Everything that can be a pure function is — retry decisions, state
 * transitions, console output.
 *
 * Mutable state is intentionally a thin shell: a generation counter, an
 * AbortController reference, the current LoadState (computed via the pure
 * `reduceLoadState`), and a Set of subscribers.  Everything that can be a
 * pure function is — retry decisions, state transitions, console output.
 */
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { LoadEvent } from '../../@types/loading/LoadEvent';
import type { LoadState } from '../../@types/loading/LoadState';
import type { CreateAssetSlotArgs } from '../../@types/loading/CreateAssetSlotArgs';
import { reduceLoadState } from './reduceLoadState';
import { defaultRetryPolicy } from './retryPolicy';
import { consoleAdapterFor } from './consoleAdapter';

export function createAssetSlot<T, Req>(args: CreateAssetSlotArgs<T, Req>): AssetSlot<T, Req> {
  const { name, fetch: fetchFn, commit, onRelease, retry = defaultRetryPolicy } = args;

  // ── Mutable cell.  The entire stateful surface of the loading system. ──
  let generation = 0;
  let state: LoadState<T> = { kind: 'idle' };
  let controller: AbortController | null = null;
  const subscribers = new Set<(s: LoadState<T>) => void>();
  let lastRequest: Req | null = null;
  let startedAtMs: number | null = null; // wall clock of the last load() call
  let lastReady: LoadState<T> | null = null; // for cancel() rollback
  // ── Commit serialization chain ────────────────────────────────────────
  // Holds the in-flight commit's resolve-promise, or null when no commit
  // is running.  Each runLoad's commit phase awaits this promise before
  // starting its own work, so generation order maps onto commit-completion
  // order even when commits have side-effects the slot can't see (e.g. a
  // GPU upload whose worker bake can't be aborted mid-flight).
  //
  // Why this matters: two concurrent commits for the same target (the
  // galaxyPointRenderer's vertex buffer being the canonical case) race at the
  // side-effect layer — "last writer wins" — and the slower one is
  // typically the larger (older-tier) one, so without serialization a
  // user toggling medium → large → medium ends up staring at large data
  // because the late-finishing large commit overwrote the medium commit.
  // The two existing race-checks guard the *state* transition only; they
  // can't unwind a side-effect that already happened.
  //
  // Fetch parallelism is preserved — only commits serialize.  The fast
  // cached medium fetch still runs alongside the slow large fetch; only
  // its GPU upload waits for the large GPU upload to drain.
  let commitInFlight: Promise<void> | null = null;

  // ── Auto-attached console adapter ────────────────────────────────────
  // Every slot logs structured `[loading] <name> ...` lines for free.  The
  // adapter wants `(prev, next)` because some transitions (retries, byte
  // updates) only show up by diffing two states; the slot's `subscribe`
  // contract only hands subscribers the latest state, so we close over a
  // local `prevState` cell and bridge it into the adapter signature.  See
  // consoleAdapter.ts for why the (prev, next) shape was preferred over
  // each-state-only.
  const consoleLog = consoleAdapterFor(name);
  let prevState: LoadState<T> = state;
  subscribers.add((next) => {
    consoleLog(prevState, next);
    prevState = next;
  });

  function dispatch(event: LoadEvent): void {
    state = reduceLoadState(state, event);
    if (state.kind === 'ready') lastReady = state;
    for (const sub of subscribers) sub(state);
  }

  async function sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function runLoad(req: Req, myGen: number, ctrl: AbortController): Promise<void> {
    dispatch({ kind: 'load-started', req });

    let attempt = 0;
    let value: T;

    // ── Retry loop ────────────────────────────────────────────────────
    while (true) {
      try {
        value = await fetchFn(req, ctrl.signal, (loaded, total) => {
          // Drop late progress events from superseded fetches.
          if (myGen !== generation) return;
          dispatch({ kind: 'bytes', loaded, total });
        });
        dispatch({ kind: 'fetch-succeeded' });
        break;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // superseded — silent exit
        const decision = retry(attempt, err as Error);
        if (decision === 'give-up') {
          dispatch({ kind: 'gave-up', error: err as Error, attempt });
          return;
        }
        attempt += 1;
        dispatch({ kind: 'retry-scheduled', attempt });
        try {
          await sleep(decision.delayMs, ctrl.signal);
        } catch {
          return; // sleep aborted by supersession
        }
      }
    }

    // ── First race-check ──────────────────────────────────────────────
    if (myGen !== generation) return;

    // ── Acquire the commit slot ───────────────────────────────────────
    // Snapshot any in-flight prior commit, then publish ours so a
    // later generation can chain after us.  We keep our own promise in
    // `mine` so the `finally` block can null `commitInFlight` only if
    // we're still the current tail of the chain.
    const prior = commitInFlight;
    let resolveMine!: () => void;
    const mine = new Promise<void>((r) => {
      resolveMine = r;
    });
    commitInFlight = mine;

    try {
      if (prior) await prior;

      // ── Third race-check (post-wait) ────────────────────────────────
      // While we waited for the prior commit to drain, an even newer
      // generation may have arrived.  If so, drop without starting our
      // commit at all — the newer gen will do the side-effect we'd
      // otherwise duplicate.  This keeps the stale-data window to the
      // single prior commit's duration rather than compounding.
      if (myGen !== generation) return;

      dispatch({ kind: 'committing' });

      if (commit) {
        try {
          await commit(value, ctrl.signal, req);
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          dispatch({ kind: 'gave-up', error: err as Error, attempt });
          return;
        }
      }
    } finally {
      resolveMine();
      // Only clear the chain head if no later generation enqueued
      // behind us — otherwise we'd orphan their `await prior`.
      if (commitInFlight === mine) commitInFlight = null;
    }

    // ── Second race-check ─────────────────────────────────────────────
    if (myGen !== generation) return;

    dispatch({ kind: 'committed', value, nowMs: Date.now() });
  }

  return {
    name,
    load(req: Req): Promise<void> {
      lastRequest = req;
      // Stamped HERE, not inside runLoad, so it marks the moment the caller
      // (the bounded asset queue) actually let this fetch off the leash — the
      // whole point of the stamp is to separate queue-start order from
      // completion order.
      startedAtMs = Date.now();
      generation += 1;
      const myGen = generation;
      controller?.abort();
      controller = new AbortController();
      // runLoad never throws (errors become 'gave-up' events); every one of
      // its `return`s is a plain return inside this async function, so the
      // promise below resolves on every terminal path — see the docblock on
      // the `load` type for the enumerated list. Returning it (rather than
      // firing-and-forgetting) is what lets a bounded queue await "this
      // slot's work is done" instead of guessing from state transitions.
      return runLoad(req, myGen, controller);
    },
    current(): T | null {
      return state.kind === 'ready' ? state.value : null;
    },
    state(): LoadState<T> {
      return state;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    lastRequest(): Req | null {
      return lastRequest;
    },
    startedAtMs(): number | null {
      return startedAtMs;
    },
    forceReload(): void {
      // load() now returns a promise; forceReload() has no caller that wants
      // to await it, so mark the discard explicit rather than leaving an
      // implicit floating promise for the linter to flag.
      if (lastRequest !== null) void this.load(lastRequest);
    },
    cancel(): void {
      generation += 1; // invalidates any in-flight runLoad
      controller?.abort();
      controller = null;
      // Roll back to last ready state, or idle if there was none.
      state = lastReady ?? { kind: 'idle' };
      for (const sub of subscribers) sub(state);
    },
    release(): void {
      // The evict edge of two-way demand — the inverse of load().
      //
      // Like cancel(), it bumps the generation and aborts the controller: the
      // generation bump is what composes with the slot's race machinery, so a
      // fetch or commit that resolves after this call fails its race-check and
      // is discarded (a late commit must not resurrect a released slot). The
      // abort unwinds any in-flight fetch promptly rather than leaving it to run
      // to completion behind a dead generation.
      //
      // Unlike cancel() — which rolls back to `lastReady` — release() drops to
      // idle unconditionally and runs the un-commit hook. We snapshot whether a
      // payload was committed BEFORE transitioning, so `onRelease` fires exactly
      // once with the committed value only when one existed (state 'ready'), and
      // never when we merely aborted a still-loading fetch (nothing to free).
      // Clearing `lastReady` means a subsequent cancel() can't resurrect the
      // released value, and a second release() finds nothing to release — the
      // exactly-once guarantee holds across repeated calls.
      //
      // Gating on the `ready` discriminant rather than a non-null `current()`
      // keeps the hook correct for a slot whose committed payload is itself null.
      const releasing = state.kind === 'ready' ? { value: state.value } : null;
      generation += 1;
      controller?.abort();
      controller = null;
      lastReady = null;
      // Clear the committed request too: a released slot holds nothing, so the
      // stale-tier check reads `null` and `forceReload()` is a no-op until the
      // demand loop re-loads it at the current tier. The start stamp goes with
      // it: a released slot has no live load attempt to have started.
      lastRequest = null;
      startedAtMs = null;
      state = { kind: 'idle' };
      if (releasing && onRelease) onRelease(releasing.value);
      for (const sub of subscribers) sub(state);
    },
  };
}
