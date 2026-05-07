/**
 * LoadingDevPanel — fixed-position dev panel listing every asset slot's
 * current state with per-slot reload/cancel buttons.
 *
 * Mounted only when `import.meta.env.DEV` is true OR the URL contains
 * `?debug=loading` (escape hatch for diagnosing real production failures).
 * Tree-shaken from production builds when the dev branch is dead — the
 * mount site in `App.tsx` gates the import behind the same predicate so
 * Vite's static replacement of `import.meta.env.DEV` lets Rollup drop
 * this file from the production bundle entirely.
 *
 * ### Why one big subscribe-and-force-rerender?
 *
 * The panel needs to reflect every state transition of every slot.  We
 * could plumb each slot's state into separate `useState`s, but the panel
 * is debug scaffolding — code clarity beats the (negligible) cost of
 * re-rendering the entire panel on every slot tick.  A single counter
 * via `useState(0)` plus a `force(n => n + 1)` on each subscribe is the
 * simplest way to do this; React's batching collapses near-simultaneous
 * pushes from different slots into one render.
 *
 * ### Why call `aggregateRegistry` here rather than passing snapshots?
 *
 * The panel and the loading-bar (see `loadProgressAggregator`) consume
 * the same projection function.  Calling it inline keeps the panel's
 * "in flight" definition in lock-step with the loading bar without an
 * extra prop dance — and the snapshot is cheap (~10 slot reads).
 */
import { useEffect, useState } from 'react';
import type { AssetSlot, LoadState } from '../../services/loading/types';
import { aggregateRegistry } from '../../services/loading/aggregateRegistry';

export type LoadingDevPanelProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
};

export function LoadingDevPanel({ slots }: LoadingDevPanelProps) {
  // The setState value itself is unused — only the setter matters as a
  // re-render trigger.  Naming the value `_tick` (and using the
  // `_`-prefix lint convention) would also work; destructuring out
  // only the setter is the most concise spelling.
  const [, force] = useState(0);
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const [, slot] of slots) {
      unsubs.push(slot.subscribe(() => force((n) => n + 1)));
    }
    return () => unsubs.forEach((u) => u());
  }, [slots]);

  const snap = aggregateRegistry(slots);

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        background: 'rgba(0,0,0,0.85)',
        color: '#cfc',
        font: '11px/1.4 ui-monospace, monospace',
        padding: '8px 10px',
        borderRadius: 4,
        zIndex: 99999,
        maxWidth: 480,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
        Asset Loading ({snap.inFlightCount} in flight)
      </div>
      {snap.slots.map(({ name, state }) => {
        // `slots.get(name)` cannot return undefined here because `snap.slots`
        // is built directly from the same Map's iteration order, but the
        // `noUncheckedIndexedAccess`-aware compiler can't prove that.
        // Skipping the row when the slot is missing is the safe degradation.
        const slot = slots.get(name);
        if (!slot) return null;
        return <SlotRow key={name} name={name} state={state} slot={slot} />;
      })}
    </div>
  );
}

type SlotRowProps = {
  name: string;
  state: LoadState<unknown>;
  slot: AssetSlot<unknown, unknown>;
};

function SlotRow({ name, state, slot }: SlotRowProps) {
  const summary = describe(state);
  // The request payload (`req`) is `unknown` on every non-idle state; we
  // stringify defensively and truncate so a fat request object can't blow
  // out the panel width.
  const reqJson =
    state.kind === 'idle'
      ? '—'
      : (() => {
          try {
            return JSON.stringify(state.req).slice(0, 80);
          } catch {
            return '<unserialisable>';
          }
        })();
  return (
    <div style={{ marginTop: 4 }}>
      <div>
        <span style={{ display: 'inline-block', width: 130 }}>{name}</span>
        <span style={{ display: 'inline-block', width: 80 }}>{state.kind}</span>
        <span style={{ display: 'inline-block', width: 130 }}>{summary}</span>
        <button onClick={() => slot.forceReload()} style={{ fontSize: 10 }}>
          Reload
        </button>
        {state.kind === 'loading' && (
          <button
            onClick={() => slot.cancel()}
            style={{ fontSize: 10, marginLeft: 4 }}
          >
            Cancel
          </button>
        )}
      </div>
      <div style={{ marginLeft: 8, opacity: 0.6 }}>req: {reqJson}</div>
    </div>
  );
}

function describe(state: LoadState<unknown>): string {
  switch (state.kind) {
    case 'idle':
      return '—';
    case 'loading': {
      const pct = state.total > 0 ? Math.round((state.loaded / state.total) * 100) : 0;
      return `${pct}% (${(state.loaded / 1e6).toFixed(1)}/${(state.total / 1e6).toFixed(1)} MB)`;
    }
    case 'committing':
      return 'committing…';
    case 'ready':
      return 'ready';
    case 'error':
      return `error: ${state.error.message.slice(0, 40)}`;
  }
}
