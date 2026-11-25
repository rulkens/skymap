/**
 * SidebarToggle — the tab on a sidebar's canvas-facing edge that hides and
 * shows it. It rides the sidebar's slide, so a hidden sidebar leaves it at the
 * screen edge, at the same height. `column` is the narrow layout's one tab for
 * the stacked pair; the container query in sidebar.module.css picks which show.
 */
import type { ReactNode } from 'react';
import ChevronLeftIcon from '../../../../../src/components/icons/ChevronLeftIcon/ChevronLeftIcon';
import ChevronRightIcon from '../../../../../src/components/icons/ChevronRightIcon/ChevronRightIcon';
import styles from './SidebarToggle.module.css';

export type SidebarToggleProps = {
  readonly side: 'start' | 'end' | 'column';
  readonly expanded: boolean;
  /** Space-separated ids of the sidebars this tab hides. */
  readonly controls: string;
  /** What it hides, as the name reads after "Hide" or "Show". */
  readonly label: string;
  readonly onToggle: () => void;
};

function SidebarToggle({
  side,
  expanded,
  controls,
  label,
  onToggle,
}: SidebarToggleProps): ReactNode {
  // The chevron points the way the sidebar will move.
  const pointsLeft = (side === 'start') === expanded;
  return (
    <button
      type="button"
      className={styles[side]}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={`${expanded ? 'Hide' : 'Show'} ${label}`}
      onClick={onToggle}
    >
      {pointsLeft ? <ChevronLeftIcon size={14} /> : <ChevronRightIcon size={14} />}
    </button>
  );
}

export default SidebarToggle;
