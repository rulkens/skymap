/*
 * FrameCompare — two shots of one camera laid exactly over each other: `start` shows left of a divider, `end`
 * right of it, each with a faint trace of the other and named at its outer edge. The divider moves under a drag
 * or the arrow keys (frameCompare.client.ts); without script it stays in the middle. The labels sit under the
 * frame, each under its own half when wide.
 */
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './FrameCompare.module.css';

type FrameCompareProps = {
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
  sizes: string;
};

function FrameCompare({ start, end, startLabel, endLabel, sizes }: FrameCompareProps) {
  return (
    <figure className={styles.root}>
      <div className={styles.frame} data-compare>
        <div className={styles.layer}>
          <Shot id={end} sizes={sizes} />
          <p className={styles.edgeEnd}>{endLabel}</p>
        </div>
        <div className={styles.top}>
          <Shot id={start} sizes={sizes} />
          <p className={styles.edgeStart}>{startLabel}</p>
        </div>
        <div
          className={styles.handle}
          data-compare-handle={`Divider between ${startLabel} and ${endLabel}`}
        />
      </div>
      <figcaption className={styles.captions}>
        <ShotCaption id={start} />
        <ShotCaption id={end} />
      </figcaption>
    </figure>
  );
}

export default FrameCompare;
