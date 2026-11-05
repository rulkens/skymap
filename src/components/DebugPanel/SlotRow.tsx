/**
 * SlotRow — one asset slot's debug-panel line: rank, name, state, byte progress,
 * start/done offsets, reload/cancel. Two timestamps because completion alone
 * cannot show queue order (a 26 MB catalog popped first still finishes after a
 * 12 MB one): `start` is `slot.startedAtMs()`, `done` is `state.loadedAtMs`, both
 * in seconds since the FIRST slot started. The request rides in the `title` tooltip.
 */

import { useState, type ReactNode } from 'react';
import cx from 'classnames';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { LoadState } from '../../@types/loading/LoadState';
import { loadStateColorClass } from './loadStateColorClass';
import styles from './SlotRow.module.css';

export type SlotRowProps = {
  readonly name: string;
  readonly state: LoadState<unknown>;
  readonly slot: AssetSlot<unknown, unknown>;
  /** Authored asset-row rank (lower fetches first); `null` for unranked slots. */
  readonly rank: number | null;
  /** Earliest `startedAtMs` across all slots — the timeline's zero. */
  readonly timelineOriginMs: number | null;
};

function SlotRow({ name, state, slot, rank, timelineOriginMs }: SlotRowProps): ReactNode {
  const [hover, setHover] = useState(false);
  const colorClass = loadStateColorClass(state.kind);
  // `req` is `unknown`: stringify defensively and truncate to keep the panel narrow.
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
  const visibility = hover ? styles.shown : styles.hidden;
  return (
    <div
      className={styles.root}
      title={`req: ${reqJson}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className={styles.rank} title="Fetch rank — lower fetches first">
        {rank ?? '—'}
      </span>
      <span className={cx(styles.dot, colorClass)}>●</span>
      <span className={styles.truncate}>{name}</span>
      <span className={colorClass}>{state.kind}</span>
      <span className={styles.truncate}>{describe(state)}</span>
      <span
        className={styles.timing}
        title="seconds from the first fetch start → this one's commit"
      >
        {timing(slot, state, timelineOriginMs)}
      </span>
      <span className={styles.actions}>
        <button onClick={() => slot.forceReload()} className={cx(styles.actionButton, visibility)}>
          Reload
        </button>
        {state.kind === 'loading' && (
          <button onClick={() => slot.cancel()} className={cx(styles.cancelButton, visibility)}>
            Cancel
          </button>
        )}
      </span>
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

/** `start → done` in seconds from the timeline origin; in-flight shows `start→…`, unstarted is blank. */
function timing(
  slot: AssetSlot<unknown, unknown>,
  state: LoadState<unknown>,
  originMs: number | null,
): string {
  const startedAtMs = slot.startedAtMs();
  if (startedAtMs === null || originMs === null) return '';
  const start = ((startedAtMs - originMs) / 1000).toFixed(1);
  if (state.kind !== 'ready') return `${start}→…`;
  return `${start}→${((state.loadedAtMs - originMs) / 1000).toFixed(1)}s`;
}

export default SlotRow;
