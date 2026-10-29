import type { RefObject } from 'react';

import type { GalleryView } from './GalleryView';

/**
 * What a gallery band (PictureBand with `views`) shares with the parts of its words that follow the
 * current view: which view it is on, how to choose another, and the markers' box, which holds the
 * band still while the reader is at it. `live` is false until the page's script runs, when the first view stands.
 */
export type GalleryState = {
  views: readonly GalleryView[];
  at: number;
  live: boolean;
  /** Whether the current view was chosen by the reader; a change nobody asked for is not read out. */
  byReader: boolean;
  choose: (view: number) => void;
  marksRef: RefObject<HTMLDivElement | null>;
};
