/**
 * An edit becomes the draft: the old draft goes onto Undo under `label` (merged into the top entry
 * when both carry the same non-null gesture, so one drag is one step), and Redo is cleared.
 */
import { HISTORY_LIMIT } from '../data/studioLimits';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { StudioState } from '../../@types/session/StudioState';

export function commitDraft(
  state: StudioState & { readonly draft: ClipData },
  draft: ClipData,
  label: string,
  gesture: string | null,
): StudioState {
  const { past } = state.history;
  const coalesce = gesture !== null && past.at(-1)?.gesture === gesture;
  const entry = { draft: state.draft, label, gesture };
  return {
    ...state,
    draft,
    revision: state.revision + 1,
    history: { past: coalesce ? past : [...past, entry].slice(-HISTORY_LIMIT), future: [] },
  };
}
