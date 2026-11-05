/**
 * Where a palette card's thumbnail lives, as the browser asks for it. The
 * capture tool derives its own output directory from this, because the two
 * drifting apart breaks every card silently — the image just fails to load.
 */
export const CARD_IMAGE_DIR = '/images/featured';
