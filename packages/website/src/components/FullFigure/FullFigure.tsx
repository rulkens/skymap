/*
 * FullFigure — one picture across the whole page, between sections. It fades
 * to the page's black above and below so no frame edge shows, and its caption
 * sits in the text column under it.
 */
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './FullFigure.module.css';

type FullFigureProps = { id: string; tall?: string };

function FullFigure({ id, tall }: FullFigureProps) {
  return (
    <figure className={styles.root}>
      <div className={styles.frame}>
        <Shot id={id} tall={tall} sizes="100vw" />
      </div>
      <figcaption className={styles.caption}>
        <ShotCaption id={id} />
      </figcaption>
    </figure>
  );
}

export default FullFigure;
