/**
 * DockItem — one dock button: stroke icon over a visible label. A toggle
 * passes `open` (indicator bar + aria-pressed, not colour alone); an action
 * leaves it out and carries neither. `glyph` is decoration after the label, so
 * `name` carries what the glyph would have said.
 */

import type { ReactNode, Ref } from 'react';
import cx from 'classnames';
import styles from './Dock.module.css';

// 24-unit stroke icons, one path each.
const ICON_PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5',
  time: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  about:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5Q9.5 7 12 7Q14.5 7 14.5 9.5Q14.5 11 12 12v2M12 17.2v.01',
} as const;

export type DockItemProps = {
  readonly icon: keyof typeof ICON_PATHS;
  readonly label: string;
  readonly glyph?: string | null;
  /** Accessible name when it differs from the visible label. */
  readonly name?: string;
  readonly open?: boolean;
  readonly onClick: () => void;
  /** For a caller that returns focus here when the sheet or palette it opened closes. */
  readonly buttonRef?: Ref<HTMLButtonElement>;
};

function DockItem({
  icon,
  label,
  glyph = null,
  name,
  open,
  onClick,
  buttonRef,
}: DockItemProps): ReactNode {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cx(styles.item, open && styles.itemOpen)}
      aria-label={name}
      aria-pressed={open}
      onClick={onClick}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden>
        <path d={ICON_PATHS[icon]} />
      </svg>
      <span className={cx(styles.label, glyph !== null && styles.labelAccent)}>
        {label}
        {glyph !== null && <span aria-hidden> {glyph}</span>}
      </span>
    </button>
  );
}

export default DockItem;
