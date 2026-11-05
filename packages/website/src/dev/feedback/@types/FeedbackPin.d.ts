import type { FeedbackRect } from '../../../../../../tools/site/@types/FeedbackRect';

/** A saved note as the page remembers it for the session: `id` is the endpoint's file stem. */
export type FeedbackPin = { id: string; n: number; text: string; rect: FeedbackRect };
