import type { FeedbackPoint } from './FeedbackPoint';

/** A pointer held down on the capture layer: where it started, and whether it has become a drag. */
export type FeedbackPress = FeedbackPoint & { id: number; moved: boolean; drawing: boolean };
