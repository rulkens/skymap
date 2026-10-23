/*
 * FeatureGallery — a FeatureSection whose large visual is a slideshow of app views and whose small slot
 * is a row of thumbnails that choose the view. The state is PictureBand's (useGallery), so it moves on by
 * itself every 9 s, waits while the reader is at the thumbnails, and fetches a later view only once warmed.
 * Each picture opens its own view in the app; only the current one can be reached, as the others sit
 * under `visibility: hidden`. Before the page's script runs the first view and its label stand.
 * With `films` (loop ids) each view is that loop's wide film in place of its picture: only the current
 * one plays, a later one is fetched once it first becomes current, and the thumbnails and labels are
 * those of the loop's still.
 */
import type { KeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';

import { appLink } from '../../data/appLink.ts';
import { siteLoop } from '../../data/siteLoop.ts';
import { siteShot } from '../../data/siteShot.ts';
import { cx } from '../../utils/cx.ts';
import { galleryKeyTarget } from '../../utils/galleryKeyTarget.ts';
import { wrapIndex } from '../../utils/wrapIndex.ts';
import FeatureFilm from '../FeatureFilm/FeatureFilm.tsx';
import FeatureSection from '../FeatureSection/FeatureSection.tsx';
import { useGallery } from '../PictureBand/useGallery.ts';
import changing from '../PictureBand/viewChange.module.css';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './FeatureGallery.module.css';

type FeatureGalleryProps = {
  title: string;
  line: string;
  href: string;
  label: string;
  side?: 'left' | 'right';
  // Shot ids from data/siteShots.ts, the first one standing before the script runs.
  views?: readonly string[];
  // Or loop ids from data/siteLoops.ts, shown as films.
  films?: readonly string[];
  // How wide the large picture is drawn (the page's `big`).
  sizes: string;
};

const THUMB_SIZES = '6rem';

function FeatureGallery({ views: pictures, films, sizes, ...section }: FeatureGalleryProps) {
  const views = films?.map((id) => siteLoop(id).shot) ?? pictures!;
  const gallery = useGallery(views.map((id) => ({ id })));
  const { at, live, byReader, choose, marksRef, layers, warmed } = gallery;
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useCallback(
    (el: HTMLDivElement | null) => {
      gallery.root.current = el;
    },
    [gallery.root],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const to = galleryKeyTarget(event.key, at, views.length - 1);
    if (to === at) return;
    event.preventDefault();
    choose(to);
    thumbs.current[wrapIndex(to, views.length)]?.focus();
  };
  const current = (i: number) => (live ? i === at : i === 0);

  return (
    <div ref={root}>
      <FeatureSection
        {...section}
        small={
          <div
            ref={marksRef}
            className={cx(styles.thumbs, !live && styles.idle)}
            role="group"
            aria-label="Views"
          >
            {views.map((id, i) => (
              <button
                key={id}
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                className={styles.thumb}
                type="button"
                aria-label={siteShot(id).title}
                title={siteShot(id).title}
                aria-pressed={i === at}
                tabIndex={i === at ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={onKeyDown}
              >
                <Shot id={id} sizes={THUMB_SIZES} alt="" />
              </button>
            ))}
          </div>
        }
      >
        <figure className={styles.figure}>
          <div className={styles.frame}>
            {views.map((id, i) => {
              const shot = siteShot(id);
              return (
                <div
                  key={id}
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
                  {films ? (
                    <FeatureFilm
                      film={films[i]!}
                      sizes={sizes}
                      wide
                      active={current(i)}
                      href={appLink(shot.link, shot.query)}
                      linkLabel={`Open ${shot.title} in the app`}
                    />
                  ) : (
                    <a
                      href={appLink(shot.link, shot.query)}
                      aria-label={`Open ${shot.title} in the app`}
                    >
                      <Shot id={id} sizes={sizes} alt="" eager={i > 0 && warmed(i)} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
          {/* A change nobody asked for is not read out: a label announced every few seconds talks over the page. */}
          <figcaption className={styles.captions} aria-live={live && !byReader ? 'off' : 'polite'}>
            {views.map((id, i) => (
              <div key={id} className={cx(changing.view, !current(i) && changing.away)}>
                <ShotCaption id={id} showDrawn={false} />
              </div>
            ))}
          </figcaption>
        </figure>
      </FeatureSection>
    </div>
  );
}

export default FeatureGallery;
