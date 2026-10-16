/*
 * Beside — two blocks side by side on the page grid, five columns and six with
 * an empty one between, stacked when narrow. `picture` says the first block is
 * a picture and how wide it may be when stacked: wide, the words are centred
 * on it. `wordsFirst` puts the second block first when they stack, so a name
 * comes before its picture.
 */
import type { CSSProperties, ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Beside.module.css';

type BesideProps = { picture?: string; wordsFirst?: boolean; children: ReactNode };

function Beside({ picture, wordsFirst = false, children }: BesideProps) {
  return (
    <div
      className={cx(styles.root, picture && styles.picture, wordsFirst && styles.flip)}
      style={picture ? ({ '--picture': picture } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

export default Beside;
