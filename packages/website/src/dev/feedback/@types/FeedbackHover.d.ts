import type { FeedbackRect } from '../../../../../../tools/site/@types/FeedbackRect';

/** The element under the pointer: its box in the viewport and the tag and classes that name it. */
export type FeedbackHover = { rect: FeedbackRect; label: string };
