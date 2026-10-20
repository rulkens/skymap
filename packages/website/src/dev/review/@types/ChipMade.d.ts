import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';

/** The mark just made from a selection, for the chip to confirm. A new object is a new mark. */
export type ChipMade = { state: DocsReviewMark['state']; words: number };
