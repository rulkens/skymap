/* Band — the markup of a PictureBand: the picture (or the pictures of a gallery, one on another, with Meteors over their star fields) and the words. */
import type { CSSProperties, ReactNode } from 'react';

import type { Gallery } from '../../../../@types/Gallery';
import type { GalleryView } from '../../../../@types/GalleryView';
import { cx } from '../../../../utils/cx.ts';
import { shotRatio } from '../../../../utils/shotRatio.ts';
import { MEDIA } from '../../../../data/media.ts';
import Shot from '../Shot/Shot.tsx';
import Meteors from './Meteors.tsx';
import styles from './PictureBand.module.css';
import changing from '../gallery/viewChange.module.css';

export type BandProps = {
  views: readonly GalleryView[];
  zoom: number;
  gallery?: Gallery;
  children?: ReactNode;
};

function Band({ views, zoom, gallery, children }: BandProps) {
  const first = views[0]!;
  // How wide a picture is drawn, in window widths: the zoom, and for a gallery view with no upright cut the width
  // it has once a phone's upright box has cropped it.
  const cropped = (view: GalleryView) =>
    gallery && !view.tall
      ? Math.ceil((100 * shotRatio(view.id)) / shotRatio(first.tall ?? first.id))
      : 100;
  const sizes = (view: GalleryView) =>
    `${MEDIA.phone} ${Math.round(cropped(view) * zoom)}vw, ${Math.round(100 * zoom)}vw`;

  return (
    <section
      ref={gallery?.root}
      className={cx(styles.root, zoom !== 1 && styles.zoomed)}
      // The opening section of a page: only `npm run site:fold` reads this, to measure it against the first screen.
      data-opening=""
      style={
        {
          '--zoom': zoom,
          // A phone's pictures share one box, shaped as the first view's: its upright cut up to MEDIA.phone, the wide one above.
          '--shape': shotRatio(first.id),
          '--shape-tall': shotRatio(first.tall ?? first.id),
        } as CSSProperties
      }
    >
      <div className={cx(styles.back, gallery && styles.stack)}>
        {gallery
          ? views.map((view, i) => {
              const here = gallery.live ? i === gallery.at : i === 0;
              return (
                <div
                  key={view.id}
                  ref={(el) => {
                    gallery.layers.current[i] = el;
                  }}
                  className={cx(
                    styles.layer,
                    changing.view,
                    !here && changing.away,
                    !gallery.warmed(i) && styles.cold,
                  )}
                >
                  <Shot
                    id={view.id}
                    tall={view.tall}
                    sizes={sizes(view)}
                    eager={i === 0 || gallery.warmed(i)}
                  />
                </div>
              );
            })
          : views.map((view) => (
              <Shot key={view.id} id={view.id} tall={view.tall} sizes={sizes(view)} eager />
            ))}
        {gallery && views.some((view) => view.sky) && <Meteors views={views} at={gallery.at} />}
      </div>
      <div className={styles.copy}>{children}</div>
    </section>
  );
}

export default Band;
