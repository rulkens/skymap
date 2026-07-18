/**
 * CollapsibleSection — a foldable HUD group (SHAPE & SIZE, SPIRAL ARMS, …).
 *
 * Controlled, not self-managed: the caller owns `open` and flips it via
 * `onToggle`. The spike's panel keeps every section's open/closed flag in
 * one `state.open` map so a "collapse all" affordance and persisted layout
 * are one-line additions later — a component-local `useState` here would
 * put that state behind a wall the caller can't reach.
 */
import type { ReactNode } from 'react';
import styles from './CollapsibleSection.module.css';

export type CollapsibleSectionProps = {
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
};

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps): ReactNode {
  return (
    <div className={styles.root}>
      <button type="button" className={styles.header} onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <span className={styles.chevron} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}

export default CollapsibleSection;
