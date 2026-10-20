/* Tour — Home's invitation to the Long Way Out: the cosmic web as the ground, the words over its dark side and the picture's label along its foot. */
import { appLink } from '../../data/appLink.ts';
import { HOME_LINKS } from '../../data/homeLinks.ts';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import ViewLink from '../ViewLink/ViewLink.tsx';
import styles from './Tour.module.css';

function Tour() {
  return (
    <section className={styles.root}>
      <Shot id="tour-cosmic-web" sizes="(max-width: 900px) 134vw, 100vw" />
      <div className={styles.over}>
        <h2>Take the tour</h2>
        <p>
          The Long Way Out takes you from the Milky Way to the edge of the observable universe,
          showing some of the beautiful objects of intergalactic space.
        </p>
        <ViewLink className={styles.link} hang href={appLink(HOME_LINKS.tour)}>
          Start the tour
        </ViewLink>
        <div className={styles.caption}>
          <ShotCaption id="tour-cosmic-web" open={false} />
        </div>
      </div>
    </section>
  );
}

export default Tour;
