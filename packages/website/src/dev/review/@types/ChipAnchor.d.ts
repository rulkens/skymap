import type { FeedbackRect } from '../../../../../../tools/site/@types/FeedbackRect';

/** The first and last lines of a selection, in page coordinates: what the selection chip is placed against. */
export type ChipAnchor = { first: FeedbackRect; last: FeedbackRect };
