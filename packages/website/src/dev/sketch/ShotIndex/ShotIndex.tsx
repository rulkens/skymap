/* ShotIndex — every shot id with files, as small labelled pictures, so a `shots:` row can be filled from what exists. */
import { SITE_SHOTS } from '../../../data/siteShots.ts';
import Shot from '../../../components/shared/media/Shot/Shot.tsx';
import styles from './ShotIndex.module.css';

function ShotIndex() {
  const shots = SITE_SHOTS.filter((shot) => shot.widths.length > 0);
  return (
    <details className={styles.root}>
      <summary>All {shots.length} shot ids</summary>
      <div className={styles.grid}>
        {shots.map((shot) => (
          <figure key={shot.id}>
            <Shot id={shot.id} sizes="10rem" alt="" />
            <figcaption>{shot.id}</figcaption>
          </figure>
        ))}
      </div>
    </details>
  );
}

export default ShotIndex;
