import { CARD_IMAGE_DIR } from '../../src/data/palette/cardImageDir';

/** Under `public/`, so the dev server serves it at `CARD_IMAGE_DIR` unchanged. */
export const OUTPUT_DIR = `public${CARD_IMAGE_DIR}`;

/** The capture-spike day: keeps the framed poses (13:00, 12:56) lit consistently. */
export const DEFAULT_CAPTURE_T = '2026-09-18T12:00:00Z';
