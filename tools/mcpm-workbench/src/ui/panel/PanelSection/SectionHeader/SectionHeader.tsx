/**
 * SectionHeader — a PanelSection's header row: the fold button (chevron, icon, title, folded
 * summary) and, beside it, never inside it, the on/off pill or other `control`, so the two
 * stay separately focusable. An off section dims its icon and title. The summary is hidden
 * from assistive tech, since the body says the same and a live summary must not chatter.
 */
import { useId, useState, type ReactNode } from 'react';
import ChevronRightIcon from '../../../../../../../packages/shared/src/components/icons/ChevronRightIcon/ChevronRightIcon';
import IconTip from '../IconTip/IconTip';
import type { PanelSectionProps } from '../PanelSection';
import styles from './SectionHeader.module.css';

export type SectionHeaderProps = Omit<PanelSectionProps, 'contentKey' | 'children'>;

function SectionHeader({
  title,
  icon,
  iconTip,
  open,
  onToggle,
  on,
  onChange,
  toggleDisabled,
  toggleLabel = `Toggle ${title}`,
  control,
  summary,
}: SectionHeaderProps): ReactNode {
  const tipId = useId();
  const tipped = iconTip !== undefined;
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.fold}
        onClick={onToggle}
        aria-expanded={open}
        // Chrome lets a describedby target back into the name-from-content even under
        // aria-hidden, so a tipped button is named by aria-label instead.
        aria-label={tipped ? title : undefined}
        aria-describedby={tipped ? tipId : undefined}
        onFocus={(e) => setKeyboardFocus(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setKeyboardFocus(false)}
      >
        <span className={styles.chevron}>
          <ChevronRightIcon size={10} />
        </span>
        <span className={styles.label}>
          {tipped ? (
            <IconTip id={tipId} tip={iconTip} focused={keyboardFocus}>
              {icon}
            </IconTip>
          ) : (
            icon
          )}
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
          disabled={toggleDisabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={toggleLabel}
        />
      )}
      {control !== undefined && <div className={styles.control}>{control}</div>}
    </div>
  );
}

export default SectionHeader;
