/**
 * The root a playing clip shows: intent with the clip's applied steps folded in through the real
 * reducers, so the overlay cannot drift from what the same actions would do as dispatches. Values
 * only: nothing here may read the engine's getters, which read this view. Folding is not
 * dispatching, so `setSelectionRow`'s one-dispatcher rule is untouched. Never mutates `root`.
 */

import type { RootState } from '../../../store/types';
import type { SceneTracks } from '../../../@types/animation/compiledClip/SceneTracks';
import type { SceneApplied } from '../../../@types/animation/compiledClip/SceneApplied';
import type { FocusRow } from '../../../@types/animation/compiledClip/FocusRow';
import settingsReducer from '../../../state/settings/settingsReducer';
import selectionReducer, { updateSelectionFocus } from '../../../state/selection/selectionSlice';
import selectionRowsReducer, {
  setSelectionRow,
} from '../../../state/selectionRows/selectionRowsSlice';
import { sceneActionsOf } from '../../../utils/animation/sceneActionsOf';

/** `focusRow` is the extracted row for the last applied focus step; null when none applies. */
export function sceneView(
  root: RootState,
  tracks: SceneTracks,
  applied: SceneApplied,
  focusRow: FocusRow | null,
): RootState {
  if (applied.steps === 0 && applied.focus === 0) return root;
  let { settings, selection, selectionRows } = root;
  for (let i = 0; i < applied.steps; i++) {
    for (const action of sceneActionsOf(tracks.steps[i]!.effect, settings)) {
      settings = settingsReducer(settings, action);
    }
  }
  if (applied.focus > 0) {
    const { ref } = tracks.focus[applied.focus - 1]!;
    selection = selectionReducer(selection, updateSelectionFocus(ref));
    if (focusRow !== null) {
      selectionRows = selectionRowsReducer(
        selectionRows,
        setSelectionRow({ slot: 'focus', ...focusRow }),
      );
    }
  }
  return { ...root, settings, selection, selectionRows };
}
