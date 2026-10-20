/*
 * Figure — a picture from the shot manifest with its label under it. `disc`
 * shows a fisheye frame round with the dome's ring about it, centred and never
 * taller than the screen it is on. The children are what follows the label.
 * `seam` is for two frames edge to edge (FramePair): the label keeps to its
 * own half of the page grid, short of the seam on `start`'s right and
 * `end`'s left.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import Disc from '../Disc/Disc.tsx';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './Figure.module.css';

type FigureProps = {
  id: string;
  sizes: string;
  open?: boolean;
  disc?: boolean;
  seam?: 'start' | 'end';
  children?: ReactNode;
};

function Figure({ id, sizes, open = true, disc = false, seam, children }: FigureProps) {
  return (
    <figure className={styles.root}>
      {disc ? (
        <div className={styles.ringed}>
          <Disc id={id} sizes={sizes} />
        </div>
      ) : (
        <Shot id={id} sizes={sizes} />
      )}
      <figcaption className={cx(styles.caption, seam && styles[seam])}>
        <ShotCaption id={id} open={open} />
        {children}
      </figcaption>
    </figure>
  );
}

export default Figure;
