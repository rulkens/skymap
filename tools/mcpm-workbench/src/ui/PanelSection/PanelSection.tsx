/**
 * PanelSection — one foldable section of a workbench sidebar: a full-width
 * divider, a header that folds the body, and an optional on/off pill on the
 * row toggles' edge; an off section dims its icon and title. The pill sits
 * beside the fold button, never inside it, so the two stay separately focusable.
 * A folded section can show a one-line `summary` in its header; it is hidden from
 * assistive tech, since the body says the same and a live summary must not chatter.
 * Controlled: the caller owns `open`.
 */
import type { ReactNode } from 'react';
import ChevronRightIcon from '../../../../../src/components/icons/ChevronRightIcon/ChevronRightIcon';
import styles from './PanelSection.module.css';

export type PanelSectionProps = {
  readonly title: string;
  /** Says what the section is; drawn ahead of the title, in its colour. */
  readonly icon: ReactNode;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The header pill's state; omit for a section without one. */
  readonly on?: boolean;
  readonly onChange?: (on: boolean) => void;
  /** The pill's accessible name; defaults to `Toggle <title>`. */
  readonly toggleLabel?: string;
  /** Shown only while folded, muted, cut with an ellipsis when it does not fit. */
  readonly summary?: ReactNode;
  readonly children: ReactNode;
};

function PanelSection({
  title,
  icon,
  open,
  onToggle,
  on,
  onChange,
  toggleLabel = `Toggle ${title}`,
  summary,
  children,
}: PanelSectionProps): ReactNode {
  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.fold} onClick={onToggle} aria-expanded={open}>
          <span className={styles.chevron}>
            <ChevronRightIcon size={10} />
          </span>
          <span className={styles.label}>
            {icon}
            <span className={styles.title}>{title}</span>
            {!open && summary !== undefined && (
              <span className={styles.summary} aria-hidden>
                {summary}
              </span>
            )}
          </span>
        </button>
        {on !== undefined && onChange && (
          <input
            type="checkbox"
            className={styles.toggle}
            checked={on}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={toggleLabel}
          />
        )}
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </section>
  );
}

export default PanelSection;
