/**
 * LetterboxBars — two black bars that crop the view to a 2.39:1 frame. DOM, not
 * a shader pass: they cost no GPU and sit under the HUD. Nothing renders when
 * the viewport is wider than 2.39:1 (the height clamps to 0 in the CSS).
 */

import styles from './LetterboxBars.module.css';
import cx from 'classnames';

function LetterboxBars() {
  return (
    <>
      <div className={cx(styles.bar, styles.top)} />
      <div className={cx(styles.bar, styles.bottom)} />
    </>
  );
}

export default LetterboxBars;
