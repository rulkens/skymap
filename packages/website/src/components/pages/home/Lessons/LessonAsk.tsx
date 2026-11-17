/* LessonAsk — one of Home's classroom questions: the question, its line and the view that answers it. */
import { cx } from '../../../../utils/cx.ts';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import styles from './Lessons.module.css';

type LessonAskProps = {
  ask: string;
  line: string;
  hash: string;
  action: string;
  className?: string;
};

function LessonAsk({ ask, line, hash, action, className }: LessonAskProps) {
  return (
    <div className={cx(styles.words, className)}>
      <h3>{ask}</h3>
      <p className={styles.line}>{line}</p>
      <ViewLink hang view={hash}>
        {action}
      </ViewLink>
    </div>
  );
}

export default LessonAsk;
