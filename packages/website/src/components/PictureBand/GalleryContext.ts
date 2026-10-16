/* GalleryContext — the current view of a gallery band, for the parts of its words that follow it (CaptionGallery, ViewWords). */
import { createContext, useContext } from 'react';

import type { GalleryState } from '../../@types/GalleryState';

export const GalleryContext = createContext<GalleryState | null>(null);

export function useGalleryState(): GalleryState {
  const state = useContext(GalleryContext);
  if (!state)
    throw new Error('This part follows a gallery: put it inside a PictureBand with views');
  return state;
}
