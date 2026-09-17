import type { RootState } from '../../store/types';

/** Draw mode is the draft's existence, not a separate flag that could disagree with it. */
export function selectIsDrawingOutline(state: RootState): boolean {
  return state.outline.draft !== null;
}
