import type { PaletteAction } from './PaletteAction';
import type { PaletteCardCapture } from './PaletteCardCapture';

/** One image-led card in a browse tab's grid. */
export type PaletteCard = {
  /** Unique; for a focus card, its focus id. Also names the default image. */
  id: string;
  /** Card face + tooltip title. */
  label: string;
  /** Tooltip body, authored by hand — see `src/data/palette/featuredTabs.ts`. */
  blurb: string;
  /** Override only; the default is `/images/featured/<id>.webp`. */
  image?: string;
  action: PaletteAction;
  /** How `npm run capture-featured` frames this card; see `PaletteCardCapture`. */
  capture?: PaletteCardCapture;
};
