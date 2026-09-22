import type { PaletteAction } from './PaletteAction';
import type { PaletteCardCapture } from './PaletteCardCapture';

/** One image-led card in a browse tab's grid. */
export type PaletteCard = {
  /**
   * Unique, and the name of the default image — so a card keeps its id across a
   * focus-id rename, and `CARD_SHOT_BY_FOCUS_ID` maps the two.
   */
  id: string;
  /** Card face + tooltip title. */
  label: string;
  /** Tooltip body, authored by hand — see `src/data/palette/featuredTabs.ts`. */
  blurb: string;
  /** Override only; the default is `<id>.webp` under `CARD_IMAGE_DIR`. */
  image?: string;
  action: PaletteAction;
  /** How `npm run capture-featured` frames this card; see `PaletteCardCapture`. */
  capture?: PaletteCardCapture;
};
