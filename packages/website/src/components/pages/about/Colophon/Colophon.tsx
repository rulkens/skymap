/*
 * Colophon — the colophon's facts (the children, a narrow Claims list) on the left half of the page grid, and
 * beside them the app's own constellation names cut out as light, set in the face the Headings fact names.
 * Narrow, the picture follows the facts.
 */
import type { ReactNode } from 'react';

import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Colophon.module.css';
import { ID } from './Colophon.constants.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

type ColophonProps = { children: ReactNode };

function Colophon({ children }: ColophonProps) {
  return (
    <div className={styles.root}>
      <div className={styles.facts}>{children}</div>
      <figure className={styles.sky}>
        <div className={styles.cutout}>
          <Shot id={ID} sizes={narrowSizes('100vw', '50vw')} />
        </div>
        <figcaption>
          <ShotCaption id={ID} showDrawn={false} />
        </figcaption>
      </figure>
    </div>
  );
}

export default Colophon;
