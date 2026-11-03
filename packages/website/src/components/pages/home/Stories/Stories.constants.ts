import type { CSSProperties } from 'react';
import { siteShot } from '../../../../data/siteShot.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

// The tour's stage is seven columns and the margin to the window's edge; the exhibit's the whole window when
// nothing is pinned. A phone's 4:3 and 5:4 cuts draw their 16:10 frames 1.2 and 1.28 windows wide.
export const TOUR_SIZES = narrowSizes('120vw', '60vw');
export const EXHIBIT_SIZES = narrowSizes('128vw', '100vw');
export const EXHIBIT_LABEL = {
  title: 'The Solar System exhibit, layer by layer',
  credit: siteShot('cut-jupiter').credit,
};
// Each part's line takes its picture's colour: the web's violet, the orbits' gold.
export const TOUR_ACCENT = { '--accent': 'var(--site-accent-web)' } as CSSProperties;
export const EXHIBIT_ACCENT = { '--accent': 'var(--site-accent-orbits)' } as CSSProperties;
