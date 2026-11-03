import avif640 from '../../../../assets/maker/alexander-rulkens-640.avif?url&no-inline';
import avif1000 from '../../../../assets/maker/alexander-rulkens-1000.avif?url&no-inline';
import webp640 from '../../../../assets/maker/alexander-rulkens-640.webp?url&no-inline';
import webp1000 from '../../../../assets/maker/alexander-rulkens-1000.webp?url&no-inline';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

// The photograph is 1000 px wide, its largest file: a wider original would serve a 2x screen better.
export const PORTRAIT = {
  avif: `${avif640} 640w, ${avif1000} 1000w`,
  webp: `${webp640} 640w, ${webp1000} 1000w`,
  src: webp1000,
  width: 1000,
  height: 1500,
  sizes: narrowSizes('100vw', 'min(44rem, 50vw)'),
};
