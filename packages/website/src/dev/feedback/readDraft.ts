import { recall } from '../overlay/recall';
import type { FeedbackDraft } from './@types/FeedbackDraft';
import { DRAFT_KEY } from './draftKey';

/** The draft kept for this page, or null: another page's draft is not this one's to restore. */
export function readDraft(): FeedbackDraft | null {
  const stored = recall(DRAFT_KEY);
  if (!stored) return null;
  const draft = JSON.parse(stored) as FeedbackDraft;
  return draft.path === location.pathname ? draft : null;
}
