/*
 * Stories — Home's tours and exhibits, each shown as the app taken apart into its layers: pieces shot on their
 * own with real transparency (siteShots' `stories-*` rows) and stacked again on the page. Wide, the section holds
 * a screen still while the reader scrolls on: the parts stand on the right as a list, the current one lit with a
 * line beside it filling with the scroll, and its layers arrive and move in the stage on the left. The tour: the
 * cosmic web pulls back and the tour's caption slides in. The exhibit: the orbits open out, Jupiter settles on
 * its own orbit and the exhibit's title comes in from the side. All of it is CSS on the scroll. Narrow, under
 * reduced motion, or without scroll-driven animation nothing is pinned and each part sits by its picture.
 */
import type { CSSProperties } from 'react';

import { appLink } from '../../../../data/appLink.ts';
import { HOME_LINKS } from '../../../../data/homeLinks.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Stories.module.css';

// The tour's stage is seven columns and the margin to the window's edge; the exhibit's the whole window when
// nothing is pinned. A phone's 4:3 and 5:4 cuts draw their 16:10 frames 1.2 and 1.28 windows wide.
const TOUR_SIZES = '(max-width: 900px) 120vw, 60vw';
const EXHIBIT_SIZES = '(max-width: 900px) 128vw, 100vw';
const EXHIBIT_LABEL = {
  title: 'The Solar System exhibit, layer by layer',
  credit: siteShot('cut-jupiter').credit,
};
// Each part's line takes its picture's colour: the web's violet, the orbits' gold.
const TOUR_ACCENT = { '--accent': '#c98cf2' } as CSSProperties;
const EXHIBIT_ACCENT = { '--accent': '#d9c27a' } as CSSProperties;

function Stories() {
  return (
    <section className={styles.root} id="stories">
      <div className={styles.track}>
        <div className={styles.pin}>
          <div className={styles.words}>
            <h2>Stories in the sky</h2>
            <p className={styles.lead}>
              A tour moves the camera from view to view and says what you are looking at.
            </p>
            <div className={cx(styles.part, styles.tourPart)} style={TOUR_ACCENT}>
              <h3>The Long Way Out</h3>
              <p>
                The guided tour, from the Milky Way to the edge of the observable universe and
                back, with a caption at every step.
              </p>
              <ViewLink hang href={appLink(HOME_LINKS.tour)}>
                Start the tour
              </ViewLink>
            </div>
          </div>
          <figure className={cx(styles.stage, styles.tourStage)}>
            <div className={styles.scene}>
              <div className={styles.plate}>
                <Shot id="stories-web" sizes={TOUR_SIZES} />
              </div>
              <div className={styles.tourCaption}>
                <Shot id="stories-tour-caption" sizes="(max-width: 900px) 78vw, 22rem" />
              </div>
            </div>
            <figcaption className={styles.label}>
              <ShotCaption id="stories-web" showDrawn={false} open={false} />
            </figcaption>
          </figure>
          <div className={cx(styles.part, styles.exhibitPart)} style={EXHIBIT_ACCENT}>
            <h3>Exhibits</h3>
            <p>
              One idea in one prepared view, such as the Solar System or the cosmic web, with notes
              that say where the numbers come from.
            </p>
            <div className={styles.links}>
              <ViewLink hang href={appLink(siteShot('stories-orbits').link)}>
                Open the Solar System exhibit
              </ViewLink>
              <ObjLink size="small" hang href={sitePath('/docs/guide/tours/')}>
                Tours and exhibits
              </ObjLink>
            </div>
          </div>
          <figure className={cx(styles.stage, styles.exhibitStage)}>
            <div className={styles.scene}>
              <div className={styles.orbits}>
                <Shot id="stories-orbits" sizes={EXHIBIT_SIZES} />
              </div>
              <div className={styles.planet}>
                <Shot id="cut-jupiter" sizes="(max-width: 900px) 30vw, 16rem" alt="" />
              </div>
              <div className={styles.title}>
                <Shot id="stories-exhibit-title" sizes="(max-width: 900px) 84vw, 28rem" />
              </div>
            </div>
            <figcaption className={styles.label}>
              <ShotCaption label={EXHIBIT_LABEL} />
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

export default Stories;
