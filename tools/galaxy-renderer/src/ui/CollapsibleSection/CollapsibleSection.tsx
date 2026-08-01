/**
 * CollapsibleSection — a foldable HUD group (SHAPE & SIZE, SPIRAL ARMS, …).
 *
 * Controlled, not self-managed: the caller owns `open` and flips it via
 * `onToggle`. The spike's panel keeps every section's open/closed flag in
 * one `state.open` map so a "collapse all" affordance and persisted layout
 * are one-line additions later — a component-local `useState` here would
 * put that state behind a wall the caller can't reach.
 *
 * The optional header checkbox is the app SettingsPanel's master-toggle
 * idiom (`src/components/SettingsPanel/CollapsibleSection.tsx`): it enables
 * or disables the section's FEATURE, independently of the fold — clicking
 * the checkbox never collapses, clicking the header never flips the
 * checkbox. stopPropagation on the checkbox's pointer events is what keeps
 * the two affordances apart; both halves of the pair must be wired for the
 * slot to render at all.
 */
import type { ReactNode } from 'react';
import styles from './CollapsibleSection.module.css';

export type CollapsibleSectionProps = {
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly headerToggle?: boolean;
  readonly onHeaderToggleChange?: (value: boolean) => void;
  readonly children: ReactNode;
};

function CollapsibleSection({
  title,
  open,
  onToggle,
  headerToggle,
  onHeaderToggleChange,
  children,
}: CollapsibleSectionProps): ReactNode {
  const hasHeaderToggle = headerToggle !== undefined && onHeaderToggleChange !== undefined;
  return (
    <div className={styles.root}>
      <button type="button" className={styles.header} onClick={onToggle} aria-expanded={open}>
        {hasHeaderToggle && (
          <input
            type="checkbox"
            className={styles.headerToggle}
            checked={headerToggle}
            onChange={(e) => {
              e.stopPropagation();
              onHeaderToggleChange(e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Toggle ${title}`}
          />
        )}
        <span className={styles.headerTitle}>{title}</span>
        <span className={styles.chevron} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}

export default CollapsibleSection;
