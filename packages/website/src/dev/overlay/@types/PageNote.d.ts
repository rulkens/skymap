import type { FeedbackNote } from '../../../../../../tools/site/@types/FeedbackNote';

/** A stored feedback note of this page; `id` is the endpoint's file stem. */
export type PageNote = { id: string; note: FeedbackNote };
