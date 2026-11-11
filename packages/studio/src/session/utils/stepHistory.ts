/**
 * Undo (`from` = 'past') or redo (`from` = 'future'): the top entry of `from` becomes the draft, and
 * the current draft goes onto the other stack under the same label, so the step can be reversed.
 * No-op with nothing to step to.
 */
import type { DraftHistory } from '../../@types/session/DraftHistory';
import type { StudioState } from '../../@types/session/StudioState';

export function stepHistory(state: StudioState, from: keyof DraftHistory): StudioState {
  const { past, future } = state.history;
  const entry = state.history[from].at(-1);
  if (entry === undefined || state.draft === null) return state;
  const moved = { ...entry, draft: state.draft };
  return {
    ...state,
    draft: entry.draft,
    revision: state.revision + 1,
    history:
      from === 'past'
        ? { past: past.slice(0, -1), future: [...future, moved] }
        : { past: [...past, moved], future: future.slice(0, -1) },
  };
}
