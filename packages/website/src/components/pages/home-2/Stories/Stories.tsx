/*
 * Stories — Home's tours and exhibits, each shown as the app taken apart into its layers: pieces shot on their
 * own with real transparency (siteShots' `stories-*` rows) and stacked again on the page, each moving with the
 * scroll at its own depth. The tour: the cosmic web pulls back like the tour's camera and the tour's own caption
 * slides in nearest the reader. The exhibit: the Solar System's orbits open out, Jupiter drifts down onto its own
 * orbit, and the exhibit's title comes in from the side. With reduced motion, or without
 * scroll-driven animation, every layer rests in its finished place.
 */
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

// The tour's stage is seven columns and the margin to the window's edge; the exhibit's the whole window.
const TOUR_SIZES = '(max-width: 900px) 100vw, 60vw';
const EXHIBIT_SIZES = '(max-width: 900px) 160vw, 100vw';
const EXHIBIT_LABEL = {
  title: 'The Solar System exhibit, layer by layer',
  credit: siteShot('cut-jupiter').credit,
};

function Stories() {
  return (
    <section className={styles.root} id="stories">
      <div className={styles.tour}>
        <div className={styles.words}>
          <h2>Stories in the sky</h2>
          <p className={styles.lead}>
            A tour moves the camera from view to view and says what you are looking at.
          </p>
          <div className={cx(styles.part, styles.tourPart)}>
            <h3>The Long Way Out</h3>
            <p>
              The guided tour, from the Milky Way to the edge of the observable universe and back,
              with a caption at every step.
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
      </div>
      <div className={styles.exhibit}>
        <div className={styles.part}>
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
    </section>
  );
}

export default Stories;
