/*
 * Figure — a picture from the shot manifest with its label under it. `disc`
 * shows a fisheye frame round with the dome's ring about it, centred and never
 * taller than the screen it is on. The children are what follows the label.
 */
import type { ReactNode } from 'react';

import Disc from '../Disc/Disc.tsx';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './Figure.module.css';

type FigureProps = {
  id: string;
  sizes: string;
  open?: boolean;
  showDrawn?: boolean;
  disc?: boolean;
  children?: ReactNode;
};

function Figure({ id, sizes, open = true, showDrawn = true, disc = false, children }: FigureProps) {
  return (
    <figure className={styles.root}>
      {disc ? (
        <div className={styles.ringed}>
          <Disc id={id} sizes={sizes} />
        </div>
      ) : (
        <Shot id={id} sizes={sizes} />
      )}
      <figcaption className={styles.caption}>
        <ShotCaption id={id} open={open} showDrawn={showDrawn} />
        {children}
      </figcaption>
    </figure>
  );
}

export default Figure;
