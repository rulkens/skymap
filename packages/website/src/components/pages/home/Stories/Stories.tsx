/*
 * Stories — Home's tours and exhibits, each shown as the app taken apart into its layers: pieces shot on their
 * own with real transparency (siteShots' `stories-*` rows) and stacked again on the page. Wide, the section holds
 * a screen still while the reader scrolls on: the parts stand on the right as a list, the current one lit with a
 * line beside it filling with the scroll, and its layers arrive and move in the stage on the left. The tour: the
 * cosmic web pulls back and the tour's caption slides in. The exhibit: the orbits open out, Jupiter settles on
 * its own orbit and the exhibit's title comes in from the side. All of it is CSS on the scroll. Narrow, under
 * reduced motion, or without scroll-driven animation nothing is pinned and each part sits by its picture.
 * The words are the page's: the title, the line under it (children) and each part's.
 */
import type { ReactNode } from 'react';

import { HOME_LINKS } from '../../../../data/homeLinks.ts';
import { shotLink } from '../../../../utils/shotLink.ts';
import { cx } from '../../../../utils/cx.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Stories.module.css';
import {
  TOUR_SIZES,
  EXHIBIT_SIZES,
  EXHIBIT_LABEL,
  TOUR_ACCENT,
  EXHIBIT_ACCENT,
} from './Stories.constants.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

type StoriesProps = {
  title: string;
  /** Each part's title, its line and its link's words; the exhibit's `guide` is its page in the docs. */
  tour: { title: string; text: string; action: string };
  exhibit: { title: string; text: string; action: string; guide: { label: string; href: string } };
  children: ReactNode;
};

function Stories({ title, tour, exhibit, children }: StoriesProps) {
  return (
    <section className={styles.root} id="stories">
      <div className={styles.track}>
        <div className={styles.pin}>
          <div className={styles.words}>
            <h2>{title}</h2>
            <div className={styles.lead}>{children}</div>
            <div className={cx(styles.part, styles.tourPart)} style={TOUR_ACCENT}>
              <h3>{tour.title}</h3>
              <p>{tour.text}</p>
              <ViewLink hang view={HOME_LINKS.tour}>
                {tour.action}
              </ViewLink>
            </div>
          </div>
          <figure className={cx(styles.stage, styles.tourStage)}>
            <div className={styles.scene}>
              <div className={styles.plate}>
                <Shot id="stories-web" sizes={TOUR_SIZES} />
              </div>
              <div className={styles.tourCaption}>
                <Shot id="stories-tour-caption" sizes={narrowSizes('78vw', '22rem')} />
              </div>
            </div>
            <figcaption className={styles.label}>
              <ShotCaption id="stories-web" showDrawn={false} open={false} />
            </figcaption>
          </figure>
          <div className={cx(styles.part, styles.exhibitPart)} style={EXHIBIT_ACCENT}>
            <h3>{exhibit.title}</h3>
            <p>{exhibit.text}</p>
            <div className={styles.links}>
              <ViewLink hang view={shotLink('stories-orbits')}>
                {exhibit.action}
              </ViewLink>
              <ObjLink size="small" hang href={exhibit.guide.href}>
                {exhibit.guide.label}
              </ObjLink>
            </div>
          </div>
          <figure className={cx(styles.stage, styles.exhibitStage)}>
            <div className={styles.scene}>
              <div className={styles.orbits}>
                <Shot id="stories-orbits" sizes={EXHIBIT_SIZES} />
              </div>
              <div className={styles.planet}>
                <Shot id="cut-jupiter" sizes={narrowSizes('30vw', '16rem')} alt="" />
              </div>
              <div className={styles.title}>
                <Shot id="stories-exhibit-title" sizes={narrowSizes('84vw', '28rem')} />
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
