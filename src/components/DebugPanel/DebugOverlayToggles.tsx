/**
 * DebugOverlayToggles — the labelled checkbox rows of one debug section. Core's
 * overlays and each Layer's own host these, so the markup and its `.checkRow`
 * rule would otherwise be copied once per host; this is the one statement of
 * both. Emits bare `<label>`s, so each host still owns its own wrapper and chrome.
 */

import { Fragment, type ReactElement } from 'react';
import styles from './DebugOverlayToggles.module.css';

export type DebugOverlayTogglesProps<Key extends string> = {
  /** Literal `key`s (`as const`), so a row this host cannot toggle is a type
   *  error, not a silently-undefined checkbox. */
  readonly rows: readonly { readonly key: Key; readonly label: string }[];
  readonly overlays: Record<Key, boolean>;
  readonly onToggle: (key: Key, enabled: boolean) => void;
};

function DebugOverlayToggles<Key extends string>({
  rows,
  overlays,
  onToggle,
}: DebugOverlayTogglesProps<Key>): ReactElement {
  return (
    <Fragment>
      {rows.map((row) => (
        <label key={row.key} className={styles.checkRow}>
          <input
            type="checkbox"
            checked={overlays[row.key]}
            onChange={(e) => onToggle(row.key, e.target.checked)}
          />
          <span>{row.label}</span>
        </label>
      ))}
    </Fragment>
  );
}

export default DebugOverlayToggles;
