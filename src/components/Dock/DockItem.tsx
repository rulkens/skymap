/**
 * DockItem — one dock button: stroke icon over a visible label. A toggle
 * passes `open` (indicator bar + aria-pressed, not colour alone); an action
 * leaves it out and carries neither. `glyph` is decoration after the label, so
 * `name` carries what the glyph would have said.
 */

import type { ComponentType, ReactNode, Ref } from 'react';
import cx from 'classnames';
import type { IconProps } from '../Icon/Icon';
import styles from './Dock.module.css';

export type DockItemProps = {
  readonly icon: ComponentType<Pick<IconProps, 'size'>>;
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
  icon: ItemIcon,
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
      <ItemIcon size={24} />
      <span className={cx(styles.label, glyph !== null && styles.labelAccent)}>
        {label}
        {glyph !== null && <span aria-hidden> {glyph}</span>}
      </span>
    </button>
  );
}

export default DockItem;
