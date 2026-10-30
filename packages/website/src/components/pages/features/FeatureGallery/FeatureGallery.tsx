/*
 * FeatureGallery — a FeatureSection whose large visual is a slideshow of app views and whose small slot
 * is a row of thumbnails that choose the view. The state is PictureBand's (useGallery), so it moves on by
 * itself every 9 s, waits while the reader is at the thumbnails, and fetches a later view only once warmed.
 * Each picture opens its own view in the app; only the current one can be reached, as the others sit
 * under `visibility: hidden`. Before the page's script runs the first view and its label stand.
 * A view whose id is a loop's (data/siteLoops.ts) is that loop's wide film in place of its picture; a film
 * whose clock ran carries its clock (FilmClock) at its foot. `over` lays the panel of the app's interface
 * that belongs to a view (a card, the switches) at the picture's outer edge, outside the frame's clip;
 * both come and go with their view. `accent` is the section's colour, taken from its pictures, and
 * `reading` one true figure set large across the picture's inner edge.
 */
import type { CSSProperties, KeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';

import { appLink } from '../../../../data/appLink.ts';
import { SITE_LOOPS } from '../../../../data/siteLoops.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { galleryKeyTarget } from '../../../../utils/galleryKeyTarget.ts';
import { wrapIndex } from '../../../../utils/wrapIndex.ts';
import FeatureFilm from '../../../shared/media/FeatureFilm/FeatureFilm.tsx';
import FeatureSection from '../../../shared/layout/FeatureSection/FeatureSection.tsx';
import { useGallery } from '../../../shared/media/PictureBand/useGallery.ts';
import changing from '../../../shared/media/PictureBand/viewChange.module.css';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import FilmClock from '../FilmClock/FilmClock.tsx';
import styles from './FeatureGallery.module.css';

type FeatureGalleryProps = {
  title: string;
  line: string;
  href: string;
  label: string;
  side?: 'left' | 'right';
  // Shot ids from data/siteShots.ts, or loop ids from data/siteLoops.ts to show a film; the first one stands before the script runs.
  views: readonly string[];
  // How wide the large picture is drawn (the page's `big`).
  sizes: string;
  // A view's id to the interface shot (`element`, data/siteShots.ts) laid beside it.
  over?: Readonly<Record<string, string>>;
  accent?: string;
  // A figure true of every view in the section (a data/facts.ts row's), and what it measures.
  reading?: { value: string; label: string };
};

const THUMB_SIZES = '6rem';
// A panel is drawn at about a third of the picture.
const PANEL_SIZES = '(max-width: 900px) 46vw, 16rem';

// The instant a shot's link sets the clock to.
const linkTime = (link: string) => /(?:^|&)t=([^&]+)/.exec(link)?.[1];

function FeatureGallery({
  views: slides,
  sizes,
  over = {},
  accent,
  reading,
  ...section
}: FeatureGalleryProps) {
  const films = slides.map((id) => SITE_LOOPS.find((loop) => loop.id === id));
  const views = slides.map((id, i) => films[i]?.shot ?? id);
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
  const changes = (i: number) =>
    cx(changing.view, !current(i) && changing.away, !warmed(i) && styles.cold);
  const clocks = films.map((film, i) => {
    const days =
      film && typeof film.motion === 'object' && 'clockDays' in film.motion
        ? film.motion.clockDays
        : undefined;
    const from = linkTime(siteShot(views[i]!).link);
    return film && days && from ? { from, days, seconds: film.seconds } : undefined;
  });

  return (
    <div ref={root} style={accent ? ({ '--color-accent': accent } as CSSProperties) : undefined}>
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
        <figure className={cx(styles.figure, section.side === 'left' && styles.left)}>
          <div className={styles.stage}>
            <div className={styles.frame}>
              {views.map((id, i) => {
                const shot = siteShot(id);
                const href = appLink(shot.link, shot.query);
                return (
                  <div
                    key={id}
                    ref={(el) => {
                      layers.current[i] = el;
                    }}
                    className={cx(styles.layer, changes(i))}
                  >
                    {films[i] ? (
                      <FeatureFilm
                        film={films[i].id}
                        sizes={sizes}
                        wide
                        active={current(i)}
                        href={href}
                        linkLabel={`Open ${shot.title} in the app`}
                      />
                    ) : (
                      <a href={href} aria-label={`Open ${shot.title} in the app`}>
                        <Shot id={id} sizes={sizes} alt="" eager={i > 0 && warmed(i)} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            {slides.map(
              (id, i) =>
                over[id] && (
                  <div key={id} className={cx(styles.panel, changes(i))}>
                    <div className={styles.drift}>
                      <Shot id={over[id]} sizes={PANEL_SIZES} />
                    </div>
                  </div>
                ),
            )}
            {reading && (
              <p className={styles.reading}>
                <span className={styles.value}>{reading.value}</span>
                <span className={styles.measure}>{reading.label}</span>
              </p>
            )}
            {clocks.some(Boolean) && (
              <div className={styles.clocks}>
                {clocks.map(
                  (clock, i) =>
                    clock && (
                      <div key={slides[i]} className={changes(i)}>
                        <FilmClock
                          {...clock}
                          film={() => layers.current[i]?.querySelector('video')}
                          onScrub={() => choose(i)}
                        />
                      </div>
                    ),
                )}
              </div>
            )}
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
