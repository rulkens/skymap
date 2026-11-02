/*
 * BeforeArt — the picture over one column of Before the lesson, all three in one band of equal height and
 * none in a frame: what the browser's graphics chip draws (Saturn), a pupil's phone that turns toward the
 * pointer, and the Moon whose phases no link shows, tagged with the app's own Small data-size chip.
 */
import Phone3D from '../../../shared/media/Phone3D/Phone3D.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './BeforeArt.module.css';

type BeforeArtProps = { art: 'sky' | 'phone' | 'limits' };

const ARTS = {
  sky: () => (
    <span className={styles.saturn}>
      <Shot id="cut-saturn" sizes="18rem" alt="" />
    </span>
  ),
  phone: () => (
    <span className={styles.phone}>
      <Phone3D shot="class-tour-phone" />
    </span>
  ),
  limits: () => (
    <>
      <span className={styles.moon}>
        <Shot id="cut-moon" sizes="18rem" alt="" />
      </span>
      <span className={styles.chip}>
        <Shot id="class-tier-small" sizes="9rem" alt="" />
      </span>
    </>
  ),
};

function BeforeArt({ art }: BeforeArtProps) {
  const Art = ARTS[art];
  return (
    <div className={styles.root} aria-hidden="true">
      <Art />
    </div>
  );
}

export default BeforeArt;
