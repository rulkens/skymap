import type { GalleryView } from '../@types/GalleryView';

/**
 * The Features page's opening gallery: one picture from each Places section,
 * nearest first, and the measured galaxies last. No upright cuts, so a phone
 * crops the wide picture.
 */
export const FEATURE_VIEWS: readonly GalleryView[] = [
  { id: 'features-earth-glint' },
  { id: 'saturn' },
  { id: 'data-perseverance' },
  { id: 'features-constellations' },
  { id: 'features-flow' },
  { id: 'galaxies-measured' },
];
