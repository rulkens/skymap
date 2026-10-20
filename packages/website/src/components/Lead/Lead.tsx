/*
 * Lead — Home's first section under the flight: what the flight is, over two
 * of its views. It is a gallery band, so the page makes it an island: the
 * pictures and their labels change together.
 */
import { appLink } from '../../data/appLink.ts';
import { HOME_LINKS } from '../../data/homeLinks.ts';
import CaptionGallery from '../CaptionGallery/CaptionGallery.tsx';
import PictureBand from '../PictureBand/PictureBand.tsx';
import ViewLink from '../ViewLink/ViewLink.tsx';
import styles from './Lead.module.css';

// The start of the pull-back, then a later point of the same move.
const VIEWS = [
  { id: 'lead-park', tall: 'lead-park-portrait' },
  { id: 'earth-terminator', tall: 'earth-terminator-portrait' },
];

function Lead() {
  return (
    <PictureBand views={VIEWS} gap="half">
      <h2 className={styles.title}>From a park to the cosmic web</h2>
      <p className={styles.say}>
        The camera starts just above Søndermarken, a park in Copenhagen, and pulls back in one
        continuous move to beyond the galaxy surveys. The galaxies lie along a network of filaments,
        the cosmic web. The stars come from the Gaia star survey, the galaxies from surveys
        including SDSS, 2MRS and GLADE.
      </p>
      <ViewLink hang href={appLink(HOME_LINKS.parkFlight)}>
        Play the pull-back from the park
      </ViewLink>
      <CaptionGallery />
    </PictureBand>
  );
}

export default Lead;
