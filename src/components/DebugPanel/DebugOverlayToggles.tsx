/**
 * DebugOverlayToggles — the labelled checkbox rows of one debug section. Core's
 * overlays and each Layer's own host these, so the markup and its `.checkRow`
 * rule would otherwise be copied once per host; this is the one statement of
 * both. Emits bare rows, so each host still owns its own wrapper and chrome. A
 * row's `info` adds the MCPM workbench's ⓘ, outside the `<label>` so pressing it
 * never flips the checkbox.
 */

import { Fragment, type ReactElement } from 'react';
import CompactInfoTip from '../../../packages/shared/src/components/common/CompactInfoTip/CompactInfoTip';
import styles from './DebugOverlayToggles.module.css';

export type DebugOverlayTogglesProps<Key extends string> = {
  /** Literal `key`s (`as const`), so a row this host cannot toggle is a type
   *  error, not a silently-undefined checkbox. */
  readonly rows: readonly { readonly key: Key; readonly label: string; readonly info?: string }[];
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
      {rows.map((row) => {
        const toggle = (
          <label key={row.key} className={styles.checkRow}>
            <input
              type="checkbox"
              checked={overlays[row.key]}
              onChange={(e) => onToggle(row.key, e.target.checked)}
            />
            <span>{row.label}</span>
          </label>
        );
        if (row.info === undefined) return toggle;
        return (
          <div key={row.key} className={styles.infoRow}>
            {toggle}
            <CompactInfoTip label={row.info} align="end">
              <button type="button" className={styles.infoIcon} aria-label={`About ${row.label}`}>
                ⓘ
              </button>
            </CompactInfoTip>
          </div>
        );
      })}
    </Fragment>
  );
}

export default DebugOverlayToggles;
