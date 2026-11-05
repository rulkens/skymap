import { CARD_IMAGE_DIR } from '../../src/data/palette/cardImageDir';
import { STRUCTURE_SHOT_DIR } from '../../src/data/structure/structureShotDir';

/** Under `public/`, so the dev server serves it at `CARD_IMAGE_DIR` unchanged. */
export const OUTPUT_DIR = `public${CARD_IMAGE_DIR}`;

/** Same rule for the featured structures' shots, keyed by focus id. */
export const STRUCTURE_OUTPUT_DIR = `public${STRUCTURE_SHOT_DIR}`;

/** The capture-spike day: keeps the framed poses (13:00, 12:56) lit consistently. */
export const DEFAULT_CAPTURE_T = '2026-09-18T12:00:00Z';
