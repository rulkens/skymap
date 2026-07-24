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
 *   - No outer fixed-position wrapper.  `DebugSection` owns the panel
 *     chrome (collapsible, default closed) so this section just renders
 *     its rows.
 *   - Each row is a single line; the request payload that used to sit
 *     on its own line now lives in the row's `title` attribute (hover
 *     tooltip) so a busy loading session doesn't blow out the panel's
 *     height.
 *
 * The slot subscription pattern is taken verbatim from the legacy
 * file's "one big useState + force re-render" approach — see that
 * file's module header for the rationale.
 */

import { useEffect, useState, type MouseEvent } from 'react';
import cx from 'classnames';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { LoadState } from '../../@types/loading/LoadState';
import { aggregateRegistry } from '../../services/loading/aggregateRegistry';
import DebugSection from './DebugSection';
import styles from './AssetLoadingSection.module.css';

export type AssetLoadingSectionProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
};

// Which header tally the rows are currently restricted to. `null` means
// "show everything" (the default, pre-filter behaviour).
type FilterKind = 'idle' | 'ready' | 'error' | 'inFlight' | null;

// `inFlight` isn't a `LoadState['kind']` — it's the header's fold of
// `loading` + `committing` — so matching it against a row needs its own
// check instead of a straight `===` against `state.kind`.
function matchesFilter(filter: FilterKind, kind: LoadState<unknown>['kind']): boolean {
  if (filter === null) return true;
  if (filter === 'inFlight') return kind === 'loading' || kind === 'committing';
  return kind === filter;
}

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

  const [filter, setFilter] = useState<FilterKind>(null);
  const toggleFilter = (kind: FilterKind) =>
    setFilter((current) => (current === kind ? null : kind));

  const snap = aggregateRegistry(slots);
  const visible = snap.slots.filter(({ state }) => matchesFilter(filter, state.kind));

  return (
    <DebugSection
      title={<AssetLoadingTitle slots={snap.slots} filter={filter} onToggleFilter={toggleFilter} />}
    >
      {visible.map(({ name, state }) => {
        // `slots.get(name)` cannot return undefined here because `snap.slots`
        // is built directly from the same Map's iteration order, but the
        // `noUncheckedIndexedAccess`-aware compiler can't prove that.
        // Skipping the row when the slot is missing is the safe degradation.
        const slot = slots.get(name);
        if (!slot) return null;
        return <SlotRow key={name} name={name} state={state} slot={slot} />;
      })}
    </DebugSection>
  );
}

type SlotSnapshot = { name: string; state: LoadState<unknown> };

type AssetLoadingTitleProps = {
  slots: readonly SlotSnapshot[];
  filter: FilterKind;
  onToggleFilter: (kind: FilterKind) => void;
};

// Header tally: scan every slot's kind once per render so the collapsed
// summary shows "how healthy is loading right now" without opening the
// section. `loading` + `committing` fold into one "in flight" count since
// that's the pair `aggregateRegistry` already treats as "still working".
//
// Each count doubles as a filter toggle. This title renders inside
// `DebugSection`'s `<summary>`, so a bare click bubbles up and toggles the
// `<details>` open/closed too — every clickable span below must call both
// `preventDefault()` (stop the native `<summary>` toggle) and
// `stopPropagation()` (stop the click reaching `<summary>` at all).
function AssetLoadingTitle({ slots, filter, onToggleFilter }: AssetLoadingTitleProps) {
  let idle = 0;
  let ready = 0;
  let error = 0;
  let inFlight = 0;
  for (const { state } of slots) {
    if (state.kind === 'idle') idle++;
    else if (state.kind === 'ready') ready++;
    else if (state.kind === 'error') error++;
    else inFlight++;
  }
  // `kind` is one of a small fixed set (idle/ready/error/inFlight), so its
  // colour and its selected/dimmed look are conditional classes rather than
  // computed styles. `inFlight` borrows `loading`'s colour, the same fold
  // `matchesFilter` uses. `selected` and `dimmed` are mutually exclusive
  // (dimmed requires `filter !== kind`), so they never fight over the same
  // declaration.
  const countClass = (kind: FilterKind): string =>
    cx(
      styles.count,
      kind && STATE_COLOR_CLASS[kind === 'inFlight' ? 'loading' : kind],
      filter === kind && styles.selected,
      filter !== null && filter !== kind && styles.dimmed,
    );

  const makeToggle = (kind: FilterKind) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFilter(kind);
  };

  return (
    <>
      Asset Loading{' '}
      {inFlight > 0 && (
        <span
          className={countClass('inFlight')}
          onClick={makeToggle('inFlight')}
          title="Show only in-flight (click to toggle)"
        >
          ⟳{inFlight}{' '}
        </span>
      )}
      <span className={styles.punct}>(</span>
      <span
        className={countClass('idle')}
        onClick={makeToggle('idle')}
        title="Show only idle (click to toggle)"
      >
        {idle}
      </span>
      <span className={styles.punct}>/</span>
      <span
        className={countClass('ready')}
        onClick={makeToggle('ready')}
        title="Show only ready (click to toggle)"
      >
        {ready}
      </span>
      <span className={styles.punct}>/</span>
      <span
        className={countClass('error')}
        onClick={makeToggle('error')}
        title="Show only error (click to toggle)"
      >
        {error}
      </span>
      <span className={styles.punct}>)</span>
      {filter !== null && (
        <span className={styles.clear} onClick={makeToggle(filter)} title="Clear filter">
          ✕ clear
        </span>
      )}
    </>
  );
}

type SlotRowProps = {
  name: string;
  state: LoadState<unknown>;
  slot: AssetSlot<unknown, unknown>;
};

function SlotRow({ name, state, slot }: SlotRowProps) {
  const [hover, setHover] = useState(false);
  const summary = describe(state);
  const colorClass = stateColorClass(state.kind);
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
      <span className={cx(styles.dot, colorClass)}>●</span>
      <span className={styles.truncate}>{name}</span>
      <span className={colorClass}>{state.kind}</span>
      <span className={styles.truncate}>{summary}</span>
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

// One colour class per LoadState kind so a busy panel scans by colour
// instead of by reading every row's text — the dot + kind label share this
// map. Non-null assertions: these keys are declared in
// AssetLoadingSection.module.css, so the CSS-module index signature's
// `| undefined` (from `noUncheckedIndexedAccess`) never actually happens.
const STATE_COLOR_CLASS: Record<LoadState<unknown>['kind'], string> = {
  idle: styles.colorIdle!,
  loading: styles.colorLoading!,
  committing: styles.colorCommitting!,
  ready: styles.colorReady!,
  error: styles.colorError!,
};

function stateColorClass(kind: LoadState<unknown>['kind']): string {
  return STATE_COLOR_CLASS[kind];
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
