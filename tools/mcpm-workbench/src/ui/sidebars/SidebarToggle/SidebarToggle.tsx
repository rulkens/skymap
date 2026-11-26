/**
 * SidebarToggle — the tab on a sidebar's canvas-facing edge that hides and
 * shows it. It rides the sidebar's slide, so a hidden sidebar leaves it at the
 * screen edge, at the same height. `column` is the narrow layout's one tab for
 * the stacked pair; the container query in sidebar.module.css picks which show.
 */
import type { ReactNode } from 'react';
import ChevronLeftIcon from '../../../../../../src/components/icons/ChevronLeftIcon/ChevronLeftIcon';
import ChevronRightIcon from '../../../../../../src/components/icons/ChevronRightIcon/ChevronRightIcon';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
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
  // The tip opens below the tab and grows away from the screen edge it is near.
  const align = side === 'start' || (side === 'column' && expanded) ? 'start' : 'end';
  return (
    <span className={styles[side]}>
      <ButtonTip
        tip={`${expanded ? 'Hides' : 'Shows'} the ${label}.`}
        placement="bottom"
        align={align}
      >
        {(describedBy) => (
          <button
            type="button"
            className={side === 'start' ? styles.tabStart : styles.tabEnd}
            aria-expanded={expanded}
            aria-controls={controls}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${label}`}
            aria-describedby={describedBy}
            onClick={onToggle}
          >
            {pointsLeft ? <ChevronLeftIcon size={14} /> : <ChevronRightIcon size={14} />}
          </button>
        )}
      </ButtonTip>
    </span>
  );
}

export default SidebarToggle;
