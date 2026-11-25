/**
 * PanelSection — one foldable section of a workbench sidebar: a full-width
 * divider, a header that folds the body, and an optional on/off pill. The pill
 * sits beside the fold button, never inside it, so the two stay separately
 * focusable. Controlled: the caller owns `open`.
 */
import type { ReactNode } from 'react';
import cx from 'classnames';
import ChevronRightIcon from '../../../../../src/components/icons/ChevronRightIcon/ChevronRightIcon';
import styles from './PanelSection.module.css';

export type PanelSectionProps = {
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The header pill's state; omit for a section without one. */
  readonly on?: boolean;
  readonly onChange?: (on: boolean) => void;
  /** The pill's accessible name; defaults to `Toggle <title>`. */
  readonly toggleLabel?: string;
  readonly children: ReactNode;
};

function PanelSection({
  title,
  open,
  onToggle,
  on,
  onChange,
  toggleLabel = `Toggle ${title}`,
  children,
}: PanelSectionProps): ReactNode {
  return (
    <section className={styles.root}>
      <div className={styles.header}>
        {on !== undefined && onChange && (
          <input
            type="checkbox"
            className={styles.toggle}
            checked={on}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={toggleLabel}
          />
        )}
        <button type="button" className={styles.fold} onClick={onToggle} aria-expanded={open}>
          <span className={styles.title}>{title}</span>
          <span className={cx(styles.chevron, open && styles.chevronOpen)}>
            <ChevronRightIcon size={10} />
          </span>
        </button>
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </section>
  );
}

export default PanelSection;
