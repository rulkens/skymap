import type { FoldSize } from './@types/FoldSize';

/**
 * The windows the fold check opens. The wide ones are a browser's page area,
 * not the screen: 1280x665 is a 13-inch laptop with its toolbars showing.
 */
export const FOLD_SIZES: readonly FoldSize[] = [
  { width: 1728, height: 943, phone: false },
  { width: 1440, height: 780, phone: false },
  { width: 1280, height: 665, phone: false },
  { width: 1024, height: 700, phone: false },
  { width: 390, height: 760, phone: true },
  { width: 360, height: 640, phone: true },
];
