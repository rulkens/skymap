/* Band — the markup of a PictureBand: the picture (or the pictures of a gallery, one on another) and the words. */
import type { CSSProperties, ReactNode } from 'react';

import type { GalleryView } from '../../@types/GalleryView';
import { cx } from '../../utils/cx.ts';
import { shotSources } from '../../utils/shotSources.ts';
import Shot from '../Shot/Shot.tsx';
import styles from './PictureBand.module.css';
import changing from './viewChange.module.css';
import type { Gallery } from './useGallery.ts';

export type BandProps = {
  views: readonly GalleryView[];
  words: 'left' | 'right';
  gap: 'none' | 'half' | 'full';
  eager: boolean;
  zoom: number;
  gallery?: Gallery;
  children?: ReactNode;
};

const ratio = (id: string) => shotSources(id).width / shotSources(id).height;
// A phone's pictures share one box, shaped as the first view's: its upright cut up to Shot's 700px, the wide one above.
const shape = (id: string) => `${shotSources(id).width} / ${shotSources(id).height}`;

function Band({ views, words, gap, eager, zoom, gallery, children }: BandProps) {
  const first = views[0]!;
  // How wide a picture is drawn, in window widths: the zoom, and for a gallery view with no upright cut the width
  // it has once a phone's upright box has cropped it.
  const cropped = (view: GalleryView) =>
    gallery && !view.tall ? Math.ceil((100 * ratio(view.id)) / ratio(first.tall ?? first.id)) : 100;
  const sizes = (view: GalleryView) =>
    `(max-width: 700px) ${Math.round(cropped(view) * zoom)}vw, ${Math.round(100 * zoom)}vw`;

  return (
    <section
      ref={gallery?.root}
      className={cx(styles.root, styles[words], styles[gap], zoom !== 1 && styles.zoomed)}
      // The opening section of a page: site.css sets its title and lead by this.
      data-opening={gap === 'none' ? '' : undefined}
      style={
        {
          '--zoom': zoom,
          '--shape': shape(first.id),
          '--shape-tall': shape(first.tall ?? first.id),
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
                    eager={(eager && i === 0) || (i > 0 && gallery.warmed(i))}
                  />
                </div>
              );
            })
          : views.map((view) => (
              <Shot key={view.id} id={view.id} tall={view.tall} sizes={sizes(view)} eager={eager} />
            ))}
      </div>
      <div className={styles.copy}>{children}</div>
    </section>
  );
}

export default Band;
