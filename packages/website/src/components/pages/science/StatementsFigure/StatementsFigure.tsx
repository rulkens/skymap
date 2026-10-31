/*
 * StatementsFigure — one cut-out standing over the statements of the Claims list under it: on the page grid it
 * starts on the statements' left edge, clear of the names, and is let out past their right edge, its own frame's
 * empty top and foot tucked into the gaps around it. The subject turns a little with the scroll and rests square
 * on its picture mid-window. Narrow, it has the window's width.
 */
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './StatementsFigure.module.css';

type StatementsFigureProps = { id: string; sizes: string };

function StatementsFigure({ id, sizes }: StatementsFigureProps) {
  return (
    <div className={styles.root}>
      <figure className={styles.statements}>
        <div className={styles.subject}>
          <Shot id={id} sizes={sizes} />
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={id} />
        </figcaption>
      </figure>
    </div>
  );
}

export default StatementsFigure;
