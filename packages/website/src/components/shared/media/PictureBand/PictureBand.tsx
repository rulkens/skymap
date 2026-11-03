/*
 * PictureBand — a page's opening section, whose ground is one picture, with the words on its
 * dark left side. Wide, it fits the first screen, the picture fills the band and its label (a
 * ShotCaption as the last of the words) runs along the foot; narrow, the title and lead come
 * before the picture, then the label and the rest. `zoom` enlarges a wide picture past the right
 * edge, to bring a centred subject out from under the words. With `views` the band is a gallery:
 * the words carry a CaptionGallery, so it must be inside an island.
 */
import type { ReactNode } from 'react';

import type { GalleryView } from '../../../../@types/GalleryView';
import GalleryBand from './GalleryBand.tsx';
import Band from './Band.tsx';

type PictureBandProps = ({ id: string; views?: undefined } | { views: readonly GalleryView[] }) & {
  zoom?: number;
  children?: ReactNode;
};

function PictureBand(props: PictureBandProps) {
  const { zoom = 1, children } = props;
  const views: readonly GalleryView[] = props.views ?? [{ id: props.id }];
  const Wide = views.length > 1 ? GalleryBand : Band;
  return (
    <Wide views={views} zoom={zoom}>
      {children}
    </Wide>
  );
}

export default PictureBand;
