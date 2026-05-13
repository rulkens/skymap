/**
 * AssetLoadingSection — the body of the legacy LoadingDevPanel,
 * lifted into a section of the new DebugPanel umbrella.
 *
 * Identical behaviour to the legacy panel:
 *
 *   - Subscribes to every slot's state-change channel once on mount.
 *   - Re-renders the whole section on any slot transition (debug
 *     scaffolding; the cost is negligible at the project's slot
 *     count).
 *   - Renders one row per slot with state, summary, and reload /
 *     cancel buttons.
 *
 * What changed vs. LoadingDevPanel:
 *
 *   - No outer fixed-position wrapper.  DebugPanel owns the panel
 *     chrome (`<details>` collapsible) so this section just renders
 *     its rows.
 *
 * The slot subscription pattern is taken verbatim from the legacy
 * file's "one big useState + force re-render" approach — see that
 * file's module header for the rationale.
 */

import { useEffect, useState } from 'react';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { LoadState } from '../../@types/loading/LoadState';
import { aggregateRegistry } from '../../services/loading/aggregateRegistry';

export type AssetLoadingSectionProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
};

export function AssetLoadingSection({ slots }: AssetLoadingSectionProps) {
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
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
        Asset Loading ({snap.inFlightCount} in flight)
      </summary>
      <div style={{ marginTop: 4 }}>
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
    </details>
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
          <button onClick={() => slot.cancel()} style={{ fontSize: 10, marginLeft: 4 }}>
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
