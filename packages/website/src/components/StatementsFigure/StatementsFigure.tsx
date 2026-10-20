/*
 * StatementsFigure — one figure standing over the statements of the Claims list
 * under it: on the page grid it takes the columns the statements do, clear of
 * the names. Narrow, it has the row.
 */
import Figure from '../Figure/Figure.tsx';
import styles from './StatementsFigure.module.css';

type StatementsFigureProps = { id: string; sizes: string };

function StatementsFigure({ id, sizes }: StatementsFigureProps) {
  return (
    <div className={styles.root}>
      <div className={styles.statements}>
        <Figure id={id} sizes={sizes} />
      </div>
    </div>
  );
}

export default StatementsFigure;
