/*
 * FeatureGallery — a FeatureSection whose large visual is a slideshow of app views and whose small slot
 * is a row of thumbnails that choose the view. The state is PictureBand's (useGallery), so it moves on by
 * itself every 9 s, waits while the reader is at the thumbnails, and fetches a later view only once warmed.
 * Each picture opens its own view in the app; only the current one can be reached, as the others sit
 * under `visibility: hidden`. Before the page's script runs the first view and its label stand.
 * Everything a slide brings (data/FeatureSlide) changes with it: its piece of the app's interface hangs
 * across the picture's outer edge, its figure stands in the inner top corner in the slide's own colour, a
 * film whose clock ran carries its clock (FilmClock) at its foot, and the section's accent follows the
 * slide. `frameless` lets cut-out renders float on the page; `under` lays a render behind the whole stage.
 */
import type { CSSProperties, KeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';

import type { FeatureSlide } from '../../../../@types/FeatureSlide.ts';
import { appLink } from '../../../../data/appLink.ts';
import { fact } from '../../../../data/fact.ts';
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
  // The first slide stands before the script runs.
  slides: readonly FeatureSlide[];
  // How wide the large picture is drawn (the page's `big`).
  sizes: string;
  frameless?: boolean;
  under?: string;
};

const THUMB_SIZES = '6rem';
// A piece is drawn at about three tenths of the picture, wider on a phone where it stands beside the caption.
const PIECE_SIZES = '(max-width: 900px) 42vw, 13rem';
const CUTOUT_SIZES = '(max-width: 900px) 70vw, 28rem';

// The instant a shot's link sets the clock to.
const linkTime = (link: string) => /(?:^|&)t=([^&]+)/.exec(link)?.[1];

function FeatureGallery({ slides, sizes, frameless, under, ...section }: FeatureGalleryProps) {
  const films = slides.map(({ view }) => SITE_LOOPS.find((loop) => loop.id === view));
  const views = slides.map(({ view }, i) => films[i]?.shot ?? view);
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
  const accent = slides[live ? wrapIndex(at, slides.length) : 0]!.accent;

  return (
    <div ref={root} className={styles.root} style={{ '--slide-accent': accent } as CSSProperties}>
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
        <figure
          className={cx(
            styles.figure,
            section.side === 'left' && styles.left,
            frameless && styles.frameless,
          )}
        >
          <div className={styles.stage}>
            {under && (
              <div className={styles.under} aria-hidden>
                <div className={styles.drift}>
                  <Shot id={under} sizes={sizes} />
                </div>
              </div>
            )}
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
              ({ view, cutout }, i) =>
                cutout && (
                  <div key={view} className={cx(styles.cutout, changes(i))} aria-hidden>
                    <div className={styles.drift}>
                      <Shot id={cutout} sizes={CUTOUT_SIZES} />
                    </div>
                  </div>
                ),
            )}
            {clocks.some(Boolean) && (
              <div className={styles.clocks}>
                {clocks.map(
                  (clock, i) =>
                    clock && (
                      <div key={slides[i]!.view} className={changes(i)}>
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
          <div className={styles.readings}>
            {slides.map(({ view, fact: id, accent: color }, i) => {
              const figure = id ? fact(id).figure : undefined;
              return (
                figure && (
                  <p key={view} className={cx(styles.reading, changes(i))} style={{ color }}>
                    <span className={styles.value}>{figure.value}</span>
                    <span className={styles.measure}>{figure.measure}</span>
                  </p>
                )
              );
            })}
          </div>
          {slides.some((slide) => slide.piece) && (
            <div className={styles.pieces}>
              {slides.map(
                ({ view, piece, bar }, i) =>
                  piece && (
                    <div key={view} className={cx(styles.piece, bar && styles.bar, changes(i))}>
                      <div className={styles.drift}>
                        <Shot id={piece} sizes={PIECE_SIZES} />
                      </div>
                    </div>
                  ),
              )}
            </div>
          )}
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
