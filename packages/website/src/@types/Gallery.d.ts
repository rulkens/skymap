import type { RefObject } from 'react';

import type { GalleryState } from './GalleryState';

/** A gallery's state (useGallery) with what its markup hands back: the band's box, the views' layers, which may load. */
export type Gallery = GalleryState & {
  /** The band's section, for the pointer and focus that warm the next view. */
  root: RefObject<HTMLElement | null>;
  /** One element per view, holding its picture. */
  layers: RefObject<(HTMLElement | null)[]>;
  /** Whether view `i` may be fetched. */
  warmed: (i: number) => boolean;
};
