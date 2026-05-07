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
 *     [commit (await — async, e.g. GPU upload)]
 *        │
 *        ▼ ── Second race-check: myGen === generation? if not, drop
 *        │
 *        ▼
 *     [dispatch 'committed', notify subscribers]
 *
 * The two race-checks are the structural fix for the tier-swap bug.  Without
 * them, a slow load A's commit can stomp a faster load B's value, and a
 * slow load A's `committed` notification can fire after load B's
 * `load-started`, causing the renderer to briefly see A's value as current.
 *
 * Mutable state is intentionally a thin shell: a generation counter, an
 * AbortController reference, the current LoadState (computed via the pure
 * `reduceLoadState`), and a Set of subscribers.  Everything that can be a
 * pure function is — retry decisions, state transitions, console output.
 */
import type {
  AssetSlot,
  Fetcher,
  Committer,
  LoadEvent,
  LoadState,
  RetryPolicy,
} from './types';
import { reduceLoadState } from './reduceLoadState';
import { defaultRetryPolicy } from './retryPolicy';

export type { AssetSlot };

export type CreateAssetSlotArgs<T, Req> = {
  name: string;
  fetch: Fetcher<T, Req>;
  commit?: Committer<T>;
  retry?: RetryPolicy;
};

export function createAssetSlot<T, Req>(args: CreateAssetSlotArgs<T, Req>): AssetSlot<T, Req> {
  const { name, fetch: fetchFn, commit, retry = defaultRetryPolicy } = args;

  // ── Mutable cell.  The entire stateful surface of the loading system. ──
  let generation = 0;
  let state: LoadState<T> = { kind: 'idle' };
  let controller: AbortController | null = null;
  const subscribers = new Set<(s: LoadState<T>) => void>();
  let lastRequest: Req | null = null;
  let lastReady: LoadState<T> | null = null; // for cancel() rollback

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
        value = await fetchFn(
          req,
          ctrl.signal,
          (loaded, total) => {
            // Drop late progress events from superseded fetches.
            if (myGen !== generation) return;
            dispatch({ kind: 'bytes', loaded, total });
          },
        );
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

    dispatch({ kind: 'committing' });

    if (commit) {
      try {
        await commit(value, ctrl.signal);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        dispatch({ kind: 'gave-up', error: err as Error, attempt });
        return;
      }
    }

    // ── Second race-check ─────────────────────────────────────────────
    if (myGen !== generation) return;

    dispatch({ kind: 'committed', value, nowMs: Date.now() });
  }

  return {
    name,
    load(req: Req): void {
      lastRequest = req;
      generation += 1;
      const myGen = generation;
      controller?.abort();
      controller = new AbortController();
      // Fire-and-forget — runLoad never throws (errors become 'gave-up' events).
      void runLoad(req, myGen, controller);
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
    forceReload(): void {
      if (lastRequest !== null) this.load(lastRequest);
    },
    cancel(): void {
      generation += 1; // invalidates any in-flight runLoad
      controller?.abort();
      controller = null;
      // Roll back to last ready state, or idle if there was none.
      state = lastReady ?? { kind: 'idle' };
      for (const sub of subscribers) sub(state);
    },
  };
}
