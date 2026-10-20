/*
 * PictureBand — a section whose ground is one picture, with the words on its
 * dark side (`words`). Wide, the picture fills the band and its label (a ShotCaption
 * as the last of the words) runs along the foot; narrow, picture, label and words follow in turn.
 * `gap="none"` makes it a page's opening section: it fits the first screen, and
 * narrow its title and lead come before the picture. `zoom` enlarges a wide
 * picture past the right edge, to bring a centred subject out from under the words.
 * With `views` the band is a gallery: the words carry a CaptionGallery and a
 * ViewWords for anything else that follows the view, so it must be inside an island.
 */
import type { ReactNode } from 'react';

import type { GalleryView } from '../../@types/GalleryView';
import GalleryBand from './GalleryBand.tsx';
import Band from './Band.tsx';

type PictureBandProps = (
  | { id: string; tall?: string; views?: undefined }
  | { views: readonly GalleryView[] }
) & {
  words?: 'left' | 'right';
  gap?: 'none' | 'half' | 'full';
  eager?: boolean;
  zoom?: number;
  children?: ReactNode;
};

function PictureBand(props: PictureBandProps) {
  const { words = 'left', gap = 'full', eager = false, zoom = 1, children } = props;
  const views: readonly GalleryView[] = props.views ?? [{ id: props.id, tall: props.tall }];
  const Wide = views.length > 1 ? GalleryBand : Band;
  return (
    <Wide views={views} words={words} gap={gap} eager={eager} zoom={zoom}>
      {children}
    </Wide>
  );
}

export default PictureBand;
