import type { GalleryView } from '../@types/GalleryView';

/**
 * The Features page's opening gallery: one picture from each Places section,
 * nearest first, and the measured galaxies last. No upright cuts, so a phone
 * crops the wide picture. `sky` is the open star field right of the words and above the subject,
 * where a meteor may cross.
 */
export const FEATURE_VIEWS: readonly GalleryView[] = [
  { id: 'features-hero-glint', sky: { left: 0.55, top: 0.13, right: 0.97, bottom: 0.4 } },
  { id: 'features-hero-saturn', sky: { left: 0.52, top: 0.13, right: 0.97, bottom: 0.31 } },
  { id: 'features-hero-perseverance' },
  { id: 'features-hero-constellations', sky: { left: 0.52, top: 0.13, right: 0.97, bottom: 0.7 } },
  { id: 'features-hero-flow' },
  { id: 'features-hero-galaxies' },
];
