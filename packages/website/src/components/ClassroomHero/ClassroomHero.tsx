/*
 * ClassroomHero — the classroom page's opening: a gallery band whose pictures,
 * labels and example addresses change together. A gallery's parts share the
 * current view through React, so the band and everything that follows the view
 * are one island, made by the page.
 */
import { CLASS_VIEWS } from '../../data/classViews.ts';
import { siteShot } from '../../data/siteShot.ts';
import { sitePath } from '../../utils/sitePath.ts';
import AddressStrip from '../AddressStrip/AddressStrip.tsx';
import CaptionGallery from '../CaptionGallery/CaptionGallery.tsx';
import PictureBand from '../PictureBand/PictureBand.tsx';
import ViewWords from '../PictureBand/ViewWords.tsx';
import styles from './ClassroomHero.module.css';

function ClassroomHero() {
  return (
    <PictureBand views={CLASS_VIEWS} gap="none" eager>
      <h1>Use Skymap in the classroom</h1>
      <p className={styles.say}>
        Distances in space are hard to feel from a page. In Skymap your pupils{' '}
        <a href={sitePath('/docs/guide/moving/')}>fly</a> across them, from the Moon to the
        galaxies, at true scale.
      </p>
      <p>
        You <a href={sitePath('/docs/guide/sharing/')}>share a view as a link</a>, and every pupil
        who opens it lands on the same object at the same date.
      </p>
      <ViewWords>
        {CLASS_VIEWS.map((view) => (
          <AddressStrip key={view.id} hash={siteShot(view.id).link} />
        ))}
      </ViewWords>
      <CaptionGallery />
    </PictureBand>
  );
}

export default ClassroomHero;
