/*
 * Stories — Home's tours and exhibits, the page's one pinned moment. Wide, the section holds a whole screen still
 * while the reader scrolls on: a large picture dissolving into the page on the left, the title and the two parts
 * on the right as a list of chapters, the one being shown lit and a line beside it filling with the scroll. It
 * is a gallery (useGallery) that never moves by itself: the scroll, a part pointed at or focused, or the
 * label's markers choose the picture. Narrow, nothing is pinned and the parts follow the picture.
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

import { appLink } from '../../../../data/appLink.ts';
import { HOME_LINKS } from '../../../../data/homeLinks.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import CaptionGallery from '../../../shared/media/CaptionGallery/CaptionGallery.tsx';
import { GalleryContext } from '../../../shared/media/PictureBand/GalleryContext.ts';
import { useGallery } from '../../../shared/media/PictureBand/useGallery.ts';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './Stories.module.css';

// In the parts' order: the tour, then an exhibit. `accent` is from the picture: the web's violet, the orbits' gold.
const VIEWS = [
  { id: 'tour-cosmic-web', accent: '#c98cf2' },
  { id: 'class-exhibit', accent: '#d9c27a' },
];
// Seven columns and the margin to the window's edge, a 4:3 stage cut from 16:9 pictures (so a third wider); on
// a phone the whole width, likewise.
const SIZES = '(max-width: 900px) 133vw, calc(66vw + 8rem)';

function Stories() {
  const gallery = useGallery(VIEWS, false);
  const { at, live, choose, layers, warmed } = gallery;
  const halves = useRef<(HTMLDivElement | null)[]>([]);
  const current = (i: number) => (live ? i === at : i === 0);
  const show = (i: number) => () => {
    if (i !== at) choose(i);
  };

  // The section's two halves, as tall as the scroll it holds still for: the half crossing a band one pixel tall
  // across the window's middle chooses the part. Only while the section is pinned (Stories.module.css).
  useEffect(() => {
    if (!window.matchMedia('(min-width: 901px)').matches) return;
    const middle = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) choose(halves.current.indexOf(entry.target as HTMLDivElement));
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    for (const half of halves.current) if (half) middle.observe(half);
    return () => middle.disconnect();
  }, [choose]);

  return (
    <GalleryContext.Provider value={gallery}>
      <section
        ref={gallery.root}
        className={styles.root}
        id="stories"
        style={{ '--view-accent': VIEWS[live ? at : 0]!.accent } as CSSProperties}
      >
        {VIEWS.map((view, i) => (
          <div
            key={view.id}
            ref={(el) => {
              halves.current[i] = el;
            }}
            className={styles.half}
            aria-hidden
          />
        ))}
        <div className={styles.pin}>
          <figure className={styles.figure}>
            <div className={styles.stage}>
              {VIEWS.map((view, i) => (
                <div
                  key={view.id}
                  ref={(el) => {
                    layers.current[i] = el;
                  }}
                  className={cx(
                    styles.layer,
                    !current(i) && styles.away,
                    !warmed(i) && styles.cold,
                  )}
                >
                  <Shot id={view.id} sizes={SIZES} eager={i > 0 && warmed(i)} />
                </div>
              ))}
            </div>
            <figcaption className={styles.caption}>
              <CaptionGallery showDrawn={false} open={false} />
            </figcaption>
          </figure>
          <div className={styles.words}>
            <h2>Stories in the sky</h2>
            <p className={styles.lead}>
              A tour moves the camera from view to view and says what you are looking at.
            </p>
            <div className={styles.parts}>
              <div
                className={cx(styles.part, current(0) && styles.lit)}
                onPointerEnter={show(0)}
                onFocus={show(0)}
              >
                <h3>The Long Way Out</h3>
                <p>
                  The guided tour, from the Milky Way to the edge of the observable universe and
                  back, with a caption at every step.
                </p>
                <ViewLink hang href={appLink(HOME_LINKS.tour)}>
                  Start the tour
                </ViewLink>
              </div>
              <div
                className={cx(styles.part, current(1) && styles.lit)}
                onPointerEnter={show(1)}
                onFocus={show(1)}
              >
                <h3>Exhibits</h3>
                <p>
                  One idea in one prepared view, such as the Solar System or the cosmic web, with
                  notes that say where the numbers come from.
                </p>
                <div className={styles.links}>
                  <ViewLink hang href={appLink(siteShot('class-exhibit').link)}>
                    Open the Solar System exhibit
                  </ViewLink>
                  <ObjLink size="small" hang href={sitePath('/docs/guide/tours/')}>
                    Tours and exhibits
                  </ObjLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </GalleryContext.Provider>
  );
}

export default Stories;
