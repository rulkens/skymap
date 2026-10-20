/* FeedbackOutline — a box over a rectangle of the window: the element under the pointer (with its name) or the area chosen. */
import type { FeedbackRect } from '../../../../../../tools/site/@types/FeedbackRect';
import { cx } from '../../../utils/cx.ts';
import { boxStyle } from '../boxStyle';
import styles from './FeedbackOutline.module.css';

type FeedbackOutlineProps = { rect: FeedbackRect; chosen?: boolean; label?: string };

function FeedbackOutline({ rect, chosen = false, label }: FeedbackOutlineProps) {
  // Against the top of the window the name goes under the box, where there is room.
  const below = rect.y < 24;
  return (
    <div className={cx(styles.root, chosen && styles.chosen)} style={boxStyle(rect)}>
      {label && <span className={cx(styles.label, below && styles.below)}>{label}</span>}
    </div>
  );
}

export default FeedbackOutline;
