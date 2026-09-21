/**
 * DebugOverlayToggles — the labelled checkbox rows for a slice of
 * `DEBUG_OVERLAY_ROWS`. Every `section` value routes its rows to a different
 * host section, so the markup and its `.checkRow` rule had been copied once
 * per host; this is the one statement of both. Emits bare `<label>`s, so each
 * host still owns its own wrapper and chrome.
 */

import { Fragment, type ReactElement } from 'react';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';
import styles from './DebugOverlayToggles.module.css';

export type DebugOverlayTogglesProps = {
  /** A filtered slice of `DEBUG_OVERLAY_ROWS`, whose `as const` keeps `key`
   *  literal — so a row this panel cannot toggle is a type error, not a
   *  silently-undefined checkbox. */
  readonly rows: readonly { readonly key: DebugOverlayKey; readonly label: string }[];
  readonly overlays: Record<DebugOverlayKey, boolean>;
  readonly onToggle: (key: DebugOverlayKey, enabled: boolean) => void;
};

function DebugOverlayToggles({ rows, overlays, onToggle }: DebugOverlayTogglesProps): ReactElement {
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
