import type { GalleryView } from '../@types/GalleryView';

/**
 * The classroom page's opening gallery, nearest first: views a teacher could
 * open in a lesson. Every one is a hero-shaped picture another page already
 * shows, with its subject to the right, clear of the words. Three have no
 * upright cut, so a phone crops the wide one.
 */
export const CLASS_VIEWS: readonly GalleryView[] = [
  { id: 'classroom-hero', tall: 'classroom-hero-portrait' },
  { id: 'earth-terminator', tall: 'earth-terminator-portrait' },
  { id: 'privacy-far-side' },
  { id: 'about-milky-way' },
  { id: 'science-wedges' },
];
