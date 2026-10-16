/*
 * FramePair — two frames of one camera, edge to edge so the eye carries a place
 * across: the same view in two layers. Narrow, they stack with the gap a
 * stack has.
 */
import Figure from '../Figure/Figure.tsx';
import styles from './FramePair.module.css';

type FramePairProps = { start: string; end: string; sizes: string };

function FramePair({ start, end, sizes }: FramePairProps) {
  return (
    <div className={styles.root}>
      <Figure id={start} sizes={sizes} seam="start" />
      <Figure id={end} sizes={sizes} seam="end" />
    </div>
  );
}

export default FramePair;
