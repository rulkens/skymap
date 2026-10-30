/*
 * Stories — Home's tours and exhibits: a picture of each, one over the other and out to the window's left
 * edge, beside the section's words. Wide, the picture holds still while the parts scroll past it. It is a
 * gallery (useGallery) that never moves by itself: the part at the window's middle, a part pointed at or
 * focused, or the label's markers choose the picture.
 */
import { useEffect, useRef } from 'react';

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
import changing from '../../../shared/media/PictureBand/viewChange.module.css';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './Stories.module.css';

// In the parts' order: the tour, then an exhibit.
const VIEWS = [{ id: 'tour-cosmic-web' }, { id: 'class-exhibit' }];
// Seven columns and the margin to the window's edge; the whole width on a phone.
const SIZES = '(max-width: 900px) 100vw, calc(50vw + 8rem)';

function Stories() {
  const gallery = useGallery(VIEWS, false);
  const { at, live, choose, layers, warmed } = gallery;
  const parts = useRef<(HTMLDivElement | null)[]>([]);
  const current = (i: number) => (live ? i === at : i === 0);
  const show = (i: number) => () => {
    if (i !== at) choose(i);
  };

  // A band one pixel tall across the window's middle: the part crossing it is the one being read. Only
  // while the picture holds still beside the parts (Stories.module.css); narrow, it has scrolled away.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 901px)').matches) return;
    const middle = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) choose(parts.current.indexOf(entry.target as HTMLDivElement));
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    for (const part of parts.current) if (part) middle.observe(part);
    return () => middle.disconnect();
  }, [choose]);

  return (
    <GalleryContext.Provider value={gallery}>
      <section ref={gallery.root} className={styles.root} id="stories">
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
                  changing.view,
                  !current(i) && changing.away,
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
          <div
            ref={(el) => {
              parts.current[0] = el;
            }}
            className={styles.part}
            onPointerEnter={show(0)}
            onFocus={show(0)}
          >
            <h3>The Long Way Out</h3>
            <p>
              The guided tour, from the Milky Way to the edge of the observable universe and back,
              with a caption at every step.
            </p>
            <ViewLink hang href={appLink(HOME_LINKS.tour)}>
              Start the tour
            </ViewLink>
          </div>
          <div
            ref={(el) => {
              parts.current[1] = el;
            }}
            className={styles.part}
            onPointerEnter={show(1)}
            onFocus={show(1)}
          >
            <h3>Exhibits</h3>
            <p>
              One idea in one prepared view, such as the Solar System or the cosmic web, with notes
              that say where the numbers come from.
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
      </section>
    </GalleryContext.Provider>
  );
}

export default Stories;
