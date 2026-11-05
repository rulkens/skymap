/* FeedbackBadge — a note's number in a disc: on its pin in the page and in the dock's list. */
import { cx } from '../../../utils/cx.ts';
import styles from './FeedbackBadge.module.css';

type FeedbackBadgeProps = { n: number; className?: string; title?: string };

function FeedbackBadge({ n, className, title }: FeedbackBadgeProps) {
  return (
    <span className={cx(styles.root, className)} title={title}>
      {n}
    </span>
  );
}

export default FeedbackBadge;
