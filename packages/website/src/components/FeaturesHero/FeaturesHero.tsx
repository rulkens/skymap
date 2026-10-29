/*
 * FeaturesHero — the Features page's opening: a gallery band of one picture per
 * Places section. A gallery's caption follows the band's current view through
 * React, so the band and its caption are one island, made by the page.
 */
import { FEATURE_VIEWS } from '../../data/featureViews.ts';
import text from '../../styles/type.module.css';
import CaptionGallery from '../CaptionGallery/CaptionGallery.tsx';
import PictureBand from '../PictureBand/PictureBand.tsx';

function FeaturesHero() {
  return (
    <PictureBand views={FEATURE_VIEWS} gap="none" eager>
      <h1>Detail at every scale</h1>
      <p className={text.say}>
        From Earth in 3D to rovers on Mars, from the Milky Way to the cosmic web, on your phone, PC
        or in a dome.
      </p>
      <CaptionGallery showDrawn={false} />
    </PictureBand>
  );
}

export default FeaturesHero;
