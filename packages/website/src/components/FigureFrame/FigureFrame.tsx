/*
 * FigureFrame — a picture on a docs page with its label under it: what
 * DocFigure (a shot of the app) and WorkbenchFigure (a tool's own picture)
 * share. The `picture` is a link to its largest file, which FigureSheet opens
 * over the page; "Enlarge" under it says so in words. `sheet` is that link's
 * address and the attributes the sheet reads. `wide` runs the figure, label
 * and all, past the text column to the page's right edge, nine columns. A
 * phone gets the picture edge to edge either way. The children are the label.
 */
import type { ReactNode } from 'react';

import type { FigureFrameSheet } from '../../@types/FigureFrameSheet';
import ObjLink from '../ObjLink/ObjLink.tsx';
import styles from './FigureFrame.module.css';

type FigureFrameProps = {
  sheet: FigureFrameSheet;
  picture: ReactNode;
  wide?: boolean;
  children?: ReactNode;
};

function FigureFrame({ sheet, picture, wide = false, children }: FigureFrameProps) {
  return (
    <figure className={wide ? styles.wide : undefined} data-embed>
      {/* Out of the keyboard's path: "Enlarge" below is the same link with words a reader can see. */}
      <a className={styles.picture} tabIndex={-1} {...sheet}>
        {picture}
        <span className={styles.unseen} data-pagefind-ignore>
          Open this picture larger
        </span>
      </a>
      <figcaption className={styles.caption}>
        {children}
        <ObjLink
          size="small"
          icon="enlarge"
          className={styles.enlarge}
          data-pagefind-ignore
          {...sheet}
        >
          Enlarge
        </ObjLink>
      </figcaption>
    </figure>
  );
}

export default FigureFrame;
