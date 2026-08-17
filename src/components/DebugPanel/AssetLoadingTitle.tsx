/**
 * AssetLoadingTitle — the asset-loading section's `<summary>` line: an
 * idle/ready/error tally plus an in-flight count, each doubling as a filter
 * toggle so the collapsed panel answers "how healthy is loading right now"
 * without being opened.
 *
 * `loading` + `committing` fold into one "in flight" count, the same pair
 * `aggregateRegistry` already treats as "still working".
 *
 * This renders inside `DebugSection`'s `<summary>`, so a bare click bubbles up
 * and toggles the `<details>` open/closed too — every clickable span must call
 * both `preventDefault()` (stop the native `<summary>` toggle) and
 * `stopPropagation()` (stop the click reaching `<summary>` at all).
 */

import cx from 'classnames';
import type { MouseEvent, ReactNode } from 'react';
import type { LoadState } from '../../@types/loading/LoadState';
import type { LoadStateFilter } from '../../@types/loading/LoadStateFilter';
import { loadStateColorClass } from './loadStateColorClass';
import styles from './AssetLoadingTitle.module.css';

export type AssetLoadingTitleProps = {
  readonly slots: readonly { readonly state: LoadState<unknown> }[];
  readonly filter: LoadStateFilter;
  readonly onToggleFilter: (kind: LoadStateFilter) => void;
};

function AssetLoadingTitle({ slots, filter, onToggleFilter }: AssetLoadingTitleProps): ReactNode {
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
  // `inFlight` borrows `loading`'s colour, the same fold `matchesLoadStateFilter`
  // uses. `selected` and `dimmed` are mutually exclusive (dimmed requires
  // `filter !== kind`), so they never fight over the same declaration.
  const countClass = (kind: LoadStateFilter): string =>
    cx(
      styles.count,
      kind && loadStateColorClass(kind === 'inFlight' ? 'loading' : kind),
      filter === kind && styles.selected,
      filter !== null && filter !== kind && styles.dimmed,
    );

  const makeToggle = (kind: LoadStateFilter) => (e: MouseEvent) => {
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

export default AssetLoadingTitle;
