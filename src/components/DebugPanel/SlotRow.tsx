/**
 * SlotRow — one asset slot's line in the debug panel: fetch rank, name,
 * lifecycle state, byte progress, start/finish offsets, and the reload/cancel
 * actions.
 *
 * ### Why two timestamps rather than just "ready"
 *
 * Terminal state alone cannot answer "did the queue fetch these in rank
 * order?". A 26 MB catalog dequeued first still turns green after a 12 MB one,
 * so a panel showing only completion makes a correctly-ordered queue look
 * broken. The `start → done` pair separates the two orderings: `start` is when
 * the bounded queue popped the entry and called `load()`
 * (`slot.startedAtMs()`), `done` is the commit (`state.loadedAtMs`). Both are
 * shown as seconds since the FIRST slot started, so the column reads as a
 * timeline rather than as wall-clock noise.
 *
 * The request payload rides in the row's `title` tooltip rather than a second
 * line, so a busy loading session doesn't blow out the panel's height.
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
  /** Authored `ASSET_WIRING` rank (lower fetches first); `null` for unranked slots. */
  readonly rank: number | null;
  /** Earliest `startedAtMs` across all slots — the timeline's zero. */
  readonly timelineOriginMs: number | null;
};

function SlotRow({ name, state, slot, rank, timelineOriginMs }: SlotRowProps): ReactNode {
  const [hover, setHover] = useState(false);
  const colorClass = loadStateColorClass(state.kind);
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
  const visibility = hover ? styles.shown : styles.hidden;
  return (
    <div
      className={styles.root}
      title={`req: ${reqJson}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className={styles.rank} title="ASSET_WIRING fetch rank — lower fetches first">
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

/**
 * `start → done`, both in seconds from the timeline origin. An unstarted slot
 * renders blank (there is no order to report yet) and an in-flight one renders
 * its start with an open-ended arrow, so a row that began first but is still
 * downloading reads as early rather than as missing.
 */
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
