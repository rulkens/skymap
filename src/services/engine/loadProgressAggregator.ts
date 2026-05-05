/**
 * loadProgressAggregator — combine per-source download progress into a single
 * UI-facing snapshot.
 *
 * ### Why a separate module
 *
 * Two distinct call sites in `engine.ts` need to forward download progress
 * to React: the initial parallel `loadAllClouds` at startup, and each
 * `reloadSource` call inside `setTier`.  Each `fetchWithProgress` chunk
 * arrival fires per-source events, but the loading-bar UI wants a single
 * scalar — total loaded bytes / total expected bytes across whatever's
 * currently in flight.
 *
 * The aggregation rule is small but easy to get subtly wrong (e.g.
 * accidentally double-counting a source that updates with `loaded=0` after
 * already reporting partial bytes).  Pulling it into a tiny module with
 * its own tests prevents regressions and keeps `engine.ts` focused on its
 * orchestration role.
 *
 * ### Why an emitter (not just a getter)
 *
 * React state mirrors engine state via callbacks (the project-wide pattern
 * — see `EngineCallbacks`).  The aggregator owns the truth, fires `emit()`
 * after every transition, and the engine forwards the snapshot through
 * `cb.onLoadProgress`.  React reconciles its UI from the snapshot; no
 * polling.
 *
 * ### Why null when empty
 *
 * "No fetches in flight" is a meaningful UI state — the loading bar fades
 * out.  Encoding that as `null` rather than `{ loaded: 0, total: 0,
 * inFlightCount: 0 }` keeps the consumer's null-check trivial and avoids
 * the awkward "is `0/0` a finished state or a pre-start state?" ambiguity.
 */

import type { LoadEventSource } from './cloudLoader';
import type { LoadProgressState } from '../../@types/EngineCallbacks';

/** Per-source progress entry held in the aggregator's internal Map. */
type Entry = {
  /** Bytes received so far on this source's stream. */
  loaded: number;
  /**
   * Bytes expected per the response's `Content-Length` header.  Zero when
   * the header was missing — UI falls back to indeterminate.
   */
  total: number;
};

/**
 * Public surface of the aggregator.  Three lifecycle methods + a getter
 * for tests; nothing else.
 *
 * Methods are no-ops on duplicate calls (e.g. calling `finish(source)`
 * twice in a row is benign), so callers don't have to track state.
 */
export type LoadProgressAggregator = {
  /**
   * Mark a source as in-flight with an initial expected total (0 if
   * Content-Length is unknown).  Idempotent — calling twice for the same
   * source overwrites the prior `total`.
   */
  start(source: LoadEventSource, total: number): void;
  /**
   * Update a source's running byte count.  Idempotent — chunk events fire
   * many times per source per fetch and that's fine.  No-op if the source
   * isn't currently registered (e.g. a delayed event after `finish`).
   */
  update(source: LoadEventSource, loaded: number, total: number): void;
  /**
   * Mark a source as no longer in-flight (success, abort, or error all
   * end up here).  No-op if the source wasn't registered.
   */
  finish(source: LoadEventSource): void;
  /**
   * Test-only: return the current snapshot without firing the emitter.
   * `null` when nothing is in flight, matching what `emit` forwards.
   */
  snapshot(): LoadProgressState | null;
};

/**
 * Factory for the aggregator.  Takes the emitter the engine wants
 * connected to `cb.onLoadProgress` and returns the bound aggregator.
 *
 * Closure-over-Map rather than a class because there's no inheritance,
 * no public field access, and the surface area is three methods.  A
 * factory function reads as data rather than as machinery.
 */
export function createLoadProgressAggregator(
  emit: (state: LoadProgressState | null) => void,
): LoadProgressAggregator {
  const entries = new Map<LoadEventSource, Entry>();

  /**
   * Recompute the aggregate snapshot from `entries`.  Returns null when
   * nothing's in flight.  Otherwise returns the running sum of loaded /
   * total bytes plus the count of in-flight sources.
   *
   * O(N) over the in-flight source set, which is bounded by the number
   * of survey sources (≤ 4 today).  Fine to call on every chunk arrival.
   */
  function snapshot(): LoadProgressState | null {
    if (entries.size === 0) return null;
    let loadedBytes = 0;
    let totalBytes = 0;
    for (const e of entries.values()) {
      loadedBytes += e.loaded;
      totalBytes += e.total;
    }
    return {
      loadedBytes,
      totalBytes,
      inFlightCount: entries.size,
    };
  }

  /** Recompute + emit.  Centralised so every mutator gets the emit for free. */
  function publish(): void {
    emit(snapshot());
  }

  return {
    start(source, total) {
      entries.set(source, { loaded: 0, total });
      publish();
    },
    update(source, loaded, total) {
      const existing = entries.get(source);
      if (!existing) return; // Late event after finish — drop silently.
      existing.loaded = loaded;
      // Allow `total` to be revised upward — some servers send 0 in the
      // initial header but populate it once the response body arrives via
      // `Transfer-Encoding: chunked`.  The aggregator keeps the larger of
      // the two so the bar's denominator never shrinks mid-stream.
      if (total > existing.total) existing.total = total;
      publish();
    },
    finish(source) {
      if (!entries.has(source)) return;
      entries.delete(source);
      publish();
    },
    snapshot,
  };
}
