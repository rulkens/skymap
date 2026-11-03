/*
 * AcrossFigure — a wide cut-out laid across the whole window and past both its edges, between a part's head and
 * its list, its label on the statements' edge under it. The scroll tips it a little as it passes.
 */
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './AcrossFigure.module.css';

type AcrossFigureProps = { id: string };

function AcrossFigure({ id }: AcrossFigureProps) {
  return (
    <figure className={styles.root}>
      <div className={styles.window}>
        <div className={styles.subject}>
          <Shot id={id} sizes="150vw" />
        </div>
      </div>
      <figcaption className={styles.caption}>
        <ShotCaption id={id} />
      </figcaption>
    </figure>
  );
}

export default AcrossFigure;
